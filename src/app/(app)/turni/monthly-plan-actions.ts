"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { parseISO, isValid } from "date-fns";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import type { MonthlyShiftPlanStatus } from "@/lib/domain/monthly-shifts";
import { canEditAssignmentsByPlanAndRole, humanizePostgrestRlsError, validateSalaAmbSameDay } from "@/lib/domain/shift-rules";
import {
  getMonthlyShiftPlanById,
  getShiftItemById,
  listShiftItemsSamePlanDateUserExcluding,
  updateShiftAssignment,
  submitMonthlyPlan,
  approveMonthlyPlan,
  reopenMonthlyPlan,
} from "@/lib/data/monthly-shift-plans";
import { insertPlanningChangeLogs } from "@/lib/data/planning-change-log";
import { getSupabaseEnv } from "@/lib/supabase/env";

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Allineati a `planning-parser` per slot sala mattina/pomeriggio */
const SALA_MATTINA_START = "08:00:00";
const SALA_MATTINA_END = "14:00:00";
const SALA_POMERIGGIO_START = "14:00:00";
const SALA_POMERIGGIO_END = "20:00:00";

function createServiceRoleSupabaseClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey);
}

function withQuery(month: string, extra: Record<string, string>) {
  yearMonthSchema.parse(month);
  const p = new URLSearchParams();
  p.set("month", month);
  for (const [k, v] of Object.entries(extra)) {
    if (v) p.set(k, v);
  }
  return `/turni?${p.toString()}`;
}

function canAssignItems(role: "specializzando" | "tutor" | "admin", planStatus: MonthlyShiftPlanStatus) {
  return canEditAssignmentsByPlanAndRole(planStatus, role);
}

export type AssignShiftItemResult =
  | { ok: true }
  | { ok: false; error: string; conflictItemIds?: string[] };

export type AssignShiftItemInput = { shiftId: string; userId: string | null; month: string };

export async function assignShiftItemAction(input: AssignShiftItemInput): Promise<AssignShiftItemResult> {
  const { shiftId: shiftItemId, userId, month } = input;
  const profile = await requireUser();
  try {
    yearMonthSchema.parse(month);

    const item = await getShiftItemById(shiftItemId);
    if (!item) {
      return { ok: false, error: "Riga turno non trovata." };
    }
    const plan = await getMonthlyShiftPlanById(item.plan_id);
    if (!plan) {
      return { ok: false, error: "Piano non trovato." };
    }
    if (!canAssignItems(profile.role, plan.status)) {
      return { ok: false, error: "Non puoi modificare assegnazioni in questo stato o con il tuo ruolo." };
    }
    if (userId !== null) {
      z.string().uuid().parse(userId);
      const others = await listShiftItemsSamePlanDateUserExcluding(
        item.plan_id,
        item.shift_date,
        userId,
        shiftItemId,
      );
      const v = validateSalaAmbSameDay(item, others);
      if (!v.ok) {
        return { ok: false, error: v.error, conflictItemIds: v.conflictItemIds };
      }
    }

    try {
      await updateShiftAssignment(shiftItemId, userId);
      try {
        await insertPlanningChangeLogs([
          {
            planning_month_id: item.plan_id,
            shift_id: item.id,
            actor_user_id: profile.id,
            action: "updated",
            before_data: { assigned_to: item.assigned_to },
            after_data: { assigned_to: userId },
          },
        ]);
      } catch (auditError) {
        // Audit is best-effort: keep assignment successful even if log fails.
        // eslint-disable-next-line no-console
        console.error("assign_shift audit failed", {
          shiftId: shiftItemId,
          message: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Errore in salvataggio";
      // eslint-disable-next-line no-console -- traccia minima per supporto
      console.log("assign_shift", { shiftId: shiftItemId, userId, month, success: false, raw: raw.slice(0, 200) });
      return { ok: false, error: humanizePostgrestRlsError(raw) };
    }

    // eslint-disable-next-line no-console -- traccia minima
    console.log("assign_shift", { shiftId: shiftItemId, userId, month, success: true });
    revalidatePath("/turni");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Valore non valido" };
    }
    if (e instanceof Error) {
      // eslint-disable-next-line no-console
      console.log("assign_shift", { shiftId: shiftItemId, userId, month, success: false, raw: e.message });
      return { ok: false, error: humanizePostgrestRlsError(e.message) };
    }
    return { ok: false, error: "Errore imprevisto" };
  }
}

/**
 * Aggiunge una riga `shift_items` (sala) per giorno + mattina/pomeriggio usando `clinical_locations`.
 * RLS: insert solo admin.
 */
export type AddPlanningSlotState = { ok: boolean; error?: string };

export async function addPlanningSlotAction(
  _prevState: AddPlanningSlotState | null,
  formData: FormData,
): Promise<AddPlanningSlotState> {
  const profile = await requireUser();
  const planId = String(formData.get("planId") ?? "");
  const date = String(formData.get("date") ?? "");
  const period = String(formData.get("period") ?? "");
  const specialty = String(formData.get("specialty") ?? "").trim();
  const roomName = String(formData.get("roomName") ?? "").trim();
  const month = String(formData.get("month") ?? "");

  if (!yearMonthSchema.safeParse(month).success) return { ok: false, error: "Mese non valido." };

  // Debug temporaneo per verificare trigger server action da UI.
  // eslint-disable-next-line no-console
  console.log("🔥 ADD SALA TRIGGERED", {
    planId,
    date,
    period,
    specialty,
    roomName,
    month,
    role: profile.role,
  });

  const fail = (message: string): AddPlanningSlotState => ({ ok: false, error: message });

  try {
    isoDateSchema.parse(date);
    z.string().uuid().parse(planId);
    const periodParsed = z.enum(["mattina", "pomeriggio"]).parse(period);
    if (!specialty) {
      return fail("Seleziona una specialita prima di aggiungere lo slot.");
    }

    if (profile.role !== "admin") {
      return fail("Solo gli amministratori possono aggiungere slot sala al piano.");
    }

    const supabaseAdmin = createServiceRoleSupabaseClient();
    const { data: planRaw, error: planErr } = await supabaseAdmin
      .from("monthly_shift_plans")
      .select("id,year,month,status")
      .eq("id", planId)
      .maybeSingle();
    if (planErr) {
      return fail(humanizePostgrestRlsError(planErr.message));
    }
    if (!planRaw) {
      return fail("Piano non trovato.");
    }
    const planRow = planRaw as { id: string; year: number; month: number; status: string };
    // eslint-disable-next-line no-console -- debug temporaneo produzione
    console.log("PLAN DEBUG", {
      id: planRow.id,
      status: planRow.status,
      year: planRow.year,
      month: planRow.month,
      requestedMonth: month,
      actorRole: profile.role,
      actorId: profile.id,
    });
    if (planRow.status === "approved") {
      return fail("Il piano è approvato: non puoi aggiungere slot.");
    }

    const dateObj = parseISO(date);
    if (!isValid(dateObj)) {
      return fail("Data non valida.");
    }
    if (dateObj.getFullYear() !== planRow.year || dateObj.getMonth() + 1 !== planRow.month) {
      return fail("La data deve appartenere al mese del piano.");
    }

    const slotRoomName = roomName.length > 0 ? roomName : null;

    const { data: dup, error: dupErr } = await supabaseAdmin
      .from("shift_items")
      .select("id")
      .eq("plan_id", planId)
      .eq("shift_date", date)
      .eq("kind", "sala")
      .eq("period", periodParsed)
      .eq("label", specialty)
      .maybeSingle();

    if (dupErr) {
      // eslint-disable-next-line no-console -- debug temporaneo produzione
      console.error("add_planning_slot duplicate check failed", {
        planId,
        date,
        period: periodParsed,
        specialty,
        message: dupErr.message,
        code: dupErr.code,
        details: dupErr.details,
        hint: dupErr.hint,
      });
      return fail(humanizePostgrestRlsError(dupErr.message));
    }
    if (dup) {
      return fail("Questa sala è già presente per questo giorno e fascia oraria.");
    }

    const start_end =
      periodParsed === "mattina"
        ? { start_time: SALA_MATTINA_START, end_time: SALA_MATTINA_END }
        : { start_time: SALA_POMERIGGIO_START, end_time: SALA_POMERIGGIO_END };

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("shift_items")
      .insert({
        plan_id: planId,
        shift_date: date,
        kind: "sala",
        period: periodParsed,
        start_time: start_end.start_time,
        end_time: start_end.end_time,
        label: specialty,
        room_name: slotRoomName,
        specialty,
        source: "manual",
      })
      .select("id")
      .single();

    if (insErr) {
      // eslint-disable-next-line no-console -- debug temporaneo produzione
      console.error("add_planning_slot insert failed", {
        planId,
        date,
        period: periodParsed,
        specialty,
        roomName: slotRoomName,
        actorRole: profile.role,
        actorId: profile.id,
        message: insErr.message,
        code: insErr.code,
        details: insErr.details,
        hint: insErr.hint,
      });
      return fail(humanizePostgrestRlsError(insErr.message));
    }
    if (!inserted) {
      return fail("Inserimento non riuscito.");
    }

    try {
      await insertPlanningChangeLogs([
        {
          planning_month_id: planId,
          shift_id: String((inserted as { id: string }).id),
          actor_user_id: profile.id,
          action: "created",
          before_data: null,
          after_data: {
            shift_date: date,
            period: periodParsed,
            specialty,
            room_name: slotRoomName,
            kind: "sala",
            source: "manual",
          },
        },
      ]);
    } catch (auditError) {
      // eslint-disable-next-line no-console
      console.error("add_planning_slot audit failed", {
        planId,
        message: auditError instanceof Error ? auditError.message : String(auditError),
      });
    }

    revalidatePath("/turni");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return fail("Valore non valido");
    }
    return fail(e instanceof Error ? humanizePostgrestRlsError(e.message) : "Errore imprevisto");
  }
}

export async function submitMonthlyPlanAction(formData: FormData) {
  const profile = await requireUser();
  const planId = String(formData.get("planId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!planId || !month) {
    redirect("/turni");
  }
  if (!yearMonthSchema.safeParse(month).success) {
    redirect("/turni");
  }

  const plan = await getMonthlyShiftPlanById(planId);
  if (!plan) {
    redirect(withQuery(month, { error: "Piano non trovato" }));
  }
  if (plan.status !== "draft") {
    redirect(withQuery(month, { error: "Il piano non è in bozza" }));
  }
  if (profile.role !== "admin" && profile.role !== "specializzando") {
    redirect(withQuery(month, { error: "Operazione non consentita" }));
  }

  try {
    await submitMonthlyPlan(planId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    redirect(withQuery(month, { error: msg }));
  }
  revalidatePath("/turni");
  redirect(withQuery(month, { ok: "plan_submitted" }));
}

export async function approveMonthlyPlanAction(formData: FormData) {
  const profile = await requireUser();
  if (profile.role !== "admin") {
    const month = String(formData.get("month") ?? "");
    if (yearMonthSchema.safeParse(month).success) {
      redirect(withQuery(month, { error: "Solo l’amministratore può approvare" }));
    }
    redirect("/turni");
  }

  const planId = String(formData.get("planId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!planId || !month) redirect("/turni");
  if (!yearMonthSchema.safeParse(month).success) redirect("/turni");

  try {
    await approveMonthlyPlan(planId, profile.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    redirect(withQuery(month, { error: msg }));
  }
  revalidatePath("/turni");
  redirect(withQuery(month, { ok: "plan_approved" }));
}

export async function reopenMonthlyPlanAction(formData: FormData) {
  const profile = await requireUser();
  if (profile.role !== "admin") {
    const month = String(formData.get("month") ?? "");
    if (yearMonthSchema.safeParse(month).success) {
      redirect(withQuery(month, { error: "Solo l’amministratore può riaprire" }));
    }
    redirect("/turni");
  }

  const planId = String(formData.get("planId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!planId || !month) redirect("/turni");
  if (!yearMonthSchema.safeParse(month).success) redirect("/turni");

  try {
    await reopenMonthlyPlan(planId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    redirect(withQuery(month, { error: msg }));
  }
  revalidatePath("/turni");
  redirect(withQuery(month, { ok: "plan_reopened" }));
}
