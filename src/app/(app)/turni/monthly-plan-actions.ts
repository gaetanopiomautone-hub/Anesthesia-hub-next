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
  publishMonthlyShiftsPlan,
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
        console.error("assign_shift audit failed", {
          shiftId: shiftItemId,
          message: auditError instanceof Error ? auditError.message : String(auditError),
        });
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "Errore in salvataggio";
      console.log("assign_shift", { shiftId: shiftItemId, userId, month, success: false, raw: raw.slice(0, 200) });
      return { ok: false, error: humanizePostgrestRlsError(raw) };
    }

    console.log("assign_shift", { shiftId: shiftItemId, userId, month, success: true });
    revalidatePath("/turni");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Valore non valido" };
    }
    if (e instanceof Error) {
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

export type UpdatePlanningSlotClinicalAreaState = { ok: true } | { ok: false; error: string };

export type UpdatePlanningSlotAssignmentLocationState = { ok: true } | { ok: false; error: string };

export type DeletePlanningSlotState =
  | { ok: true }
  | { ok: false; error: string };

function planCalendarMatchesYearMonth(planYear: number, planMonth: number, yearMonthStr: string) {
  yearMonthSchema.parse(yearMonthStr);
  const parts = yearMonthStr.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  return planYear === y && planMonth === m;
}

/**
 * Elimina una riga `shift_items` (solo kind sala) dal planning. Solo admin in bozza (non inviato/approvato).
 * Uses service role; non tocca `clinical_locations`.
 */
export async function deletePlanningSlotAction(
  _prevState: DeletePlanningSlotState | null,
  formData: FormData,
): Promise<DeletePlanningSlotState> {
  const profile = await requireUser();

  const fail = (message: string): DeletePlanningSlotState => ({ ok: false, error: message });

  const shiftItemId = String(formData.get("shiftItemId") ?? "");
  const planId = String(formData.get("planId") ?? "");
  const month = String(formData.get("month") ?? "");

  if (!yearMonthSchema.safeParse(month).success) {
    return fail("Mese non valido.");
  }

  try {
    z.string().uuid().parse(planId);
    z.string().uuid().parse(shiftItemId);

    if (profile.role !== "admin") {
      return fail("Solo gli amministratori possono eliminare slot sala dal piano.");
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

    if (!planCalendarMatchesYearMonth(planRow.year, planRow.month, month)) {
      return fail("Il mese non corrisponde al piano.");
    }

    if (planRow.status === "approved") {
      return fail("Il piano è approvato: non puoi eliminare slot.");
    }
    if (planRow.status === "submitted") {
      return fail("Il piano è inviato: non puoi eliminare slot. Riapri in bozza se necessario.");
    }

    const { data: itemRaw, error: itemErr } = await supabaseAdmin
      .from("shift_items")
      .select(
        "id,plan_id,shift_date,kind,period,label,room_name,specialty,clinical_area_id,assignment_location_id,source,assigned_to",
      )
      .eq("id", shiftItemId)
      .eq("plan_id", planId)
      .eq("kind", "sala")
      .maybeSingle();

    if (itemErr) {
      return fail(humanizePostgrestRlsError(itemErr.message));
    }
    if (!itemRaw) {
      return fail("Slot sala non trovato per questo piano.");
    }

    const item = itemRaw as {
      id: string;
      plan_id: string;
      shift_date: string;
      kind: string;
      period: string;
      label: string;
      room_name: string | null;
      specialty: string | null;
      clinical_area_id: string | null;
      assignment_location_id: string | null;
      source: string;
      assigned_to: string | null;
    };

    const { data: deletedRows, error: delErr } = await supabaseAdmin
      .from("shift_items")
      .delete()
      .eq("id", shiftItemId)
      .eq("plan_id", planId)
      .eq("kind", "sala")
      .select("id");

    if (delErr) {
      return fail(humanizePostgrestRlsError(delErr.message));
    }
    if (!deletedRows?.length) {
      return fail("Nessuno slot è stato rimosso (dato non più disponibile).");
    }

    try {
      await insertPlanningChangeLogs([
        {
          planning_month_id: planId,
          shift_id: null,
          actor_user_id: profile.id,
          action: "deleted",
          before_data: {
            id: item.id,
            shift_date: item.shift_date,
            period: item.period,
            label: item.label,
            room_name: item.room_name,
            specialty: item.specialty,
            clinical_area_id: item.clinical_area_id,
            assignment_location_id: item.assignment_location_id,
            kind: item.kind,
            source: item.source,
            assigned_to: item.assigned_to,
          },
          after_data: null,
        },
      ]);
    } catch (auditError) {
      console.error("delete_planning_slot audit failed", {
        planId,
        shiftItemId,
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

export async function addPlanningSlotAction(
  _prevState: AddPlanningSlotState | null,
  formData: FormData,
): Promise<AddPlanningSlotState> {
  const profile = await requireUser();
  const planId = String(formData.get("planId") ?? "");
  const date = String(formData.get("date") ?? "");
  const period = String(formData.get("period") ?? "");
  const clinicalAreaIdRaw = String(formData.get("clinicalAreaId") ?? "").trim();
  const assignmentLocationIdRaw = String(formData.get("assignmentLocationId") ?? "").trim();
  const month = String(formData.get("month") ?? "");

  if (!yearMonthSchema.safeParse(month).success) return { ok: false, error: "Mese non valido." };

  const fail = (message: string): AddPlanningSlotState => ({ ok: false, error: message });

  try {
    isoDateSchema.parse(date);
    z.string().uuid().parse(planId);
    z.string().uuid().parse(clinicalAreaIdRaw);
    z.string().uuid().parse(assignmentLocationIdRaw);
    const periodParsed = z.enum(["mattina", "pomeriggio"]).parse(period);

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

    const { data: areaRow, error: areaErr } = await supabaseAdmin
      .from("clinical_areas")
      .select("id,name,code")
      .eq("id", clinicalAreaIdRaw)
      .eq("is_active", true)
      .maybeSingle();

    if (areaErr) {
      return fail(humanizePostgrestRlsError(areaErr.message));
    }
    if (!areaRow) {
      return fail("Seleziona un’area sala attiva.");
    }

    const area = areaRow as { id: string; name: string; code: string };
    const displayName = area.name;

    const { data: locRow, error: locErr } = await supabaseAdmin
      .from("assignment_locations")
      .select("id,name,is_active")
      .eq("id", assignmentLocationIdRaw)
      .eq("is_active", true)
      .maybeSingle();

    if (locErr) {
      return fail(humanizePostgrestRlsError(locErr.message));
    }
    if (!locRow) {
      return fail("Seleziona una sala o attività valida.");
    }
    const loc = locRow as { id: string; name: string; is_active: boolean };

    const { data: dup, error: dupErr } = await supabaseAdmin
      .from("shift_items")
      .select("id")
      .eq("plan_id", planId)
      .eq("shift_date", date)
      .eq("kind", "sala")
      .eq("period", periodParsed)
      .eq("assignment_location_id", loc.id)
      .maybeSingle();

    if (dupErr) {
      return fail(humanizePostgrestRlsError(dupErr.message));
    }
    if (dup) {
      return fail("Questa sala o attività è già presente per questo giorno e fascia oraria.");
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
        label: displayName,
        room_name: loc.name,
        specialty: displayName,
        clinical_area_id: area.id,
        assignment_location_id: loc.id,
        source: "manual",
      })
      .select("id")
      .single();

    if (insErr) {
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
            specialty: displayName,
            room_name: loc.name,
            clinical_area_id: area.id,
            assignment_location_id: loc.id,
            kind: "sala",
            source: "manual",
          },
        },
      ]);
    } catch (auditError) {
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

export async function updatePlanningSlotClinicalAreaAction(
  _prevState: UpdatePlanningSlotClinicalAreaState | null,
  formData: FormData,
): Promise<UpdatePlanningSlotClinicalAreaState> {
  const profile = await requireUser();
  const fail = (message: string): UpdatePlanningSlotClinicalAreaState => ({ ok: false, error: message });

  const shiftItemId = String(formData.get("shiftItemId") ?? "").trim();
  const planId = String(formData.get("planId") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();
  const clinicalAreaIdRaw = String(formData.get("clinicalAreaId") ?? "").trim();

  if (!yearMonthSchema.safeParse(month).success) return fail("Mese non valido.");

  try {
    yearMonthSchema.parse(month);
    z.string().uuid().parse(shiftItemId);
    z.string().uuid().parse(planId);
    z.string().uuid().parse(clinicalAreaIdRaw);

    if (profile.role !== "admin") {
      return fail("Solo gli amministratori possono modificare l’area di uno slot sala.");
    }

    const supabaseAdmin = createServiceRoleSupabaseClient();

    const { data: itemRaw, error: itemErr } = await supabaseAdmin
      .from("shift_items")
      .select("id,plan_id,shift_date,kind,period,clinical_area_id,assignment_location_id,label,specialty")
      .eq("id", shiftItemId)
      .maybeSingle();

    if (itemErr) return fail(humanizePostgrestRlsError(itemErr.message));
    if (!itemRaw) return fail("Turno non trovato.");

    const item = itemRaw as {
      id: string;
      plan_id: string;
      shift_date: string;
      kind: string;
      period: string;
      clinical_area_id: string | null;
      assignment_location_id: string | null;
      label: string;
      specialty: string | null;
    };

    if (item.plan_id !== planId) return fail("Turno non appartenente al piano.");
    if (item.kind !== "sala") return fail("Solo gli slot in sala hanno un’area tipo.");

    const { data: planRaw, error: planErr } = await supabaseAdmin
      .from("monthly_shift_plans")
      .select("id,year,month,status")
      .eq("id", planId)
      .maybeSingle();

    if (planErr) return fail(humanizePostgrestRlsError(planErr.message));
    if (!planRaw) return fail("Piano non trovato.");

    const planRow = planRaw as { status: string; year: number; month: number };
    if (!planCalendarMatchesYearMonth(planRow.year, planRow.month, month)) {
      return fail("Il mese non corrisponde al piano.");
    }
    if (planRow.status !== "draft") {
      return fail("Modifica area solo con il piano in bozza.");
    }

    const { data: areaRow, error: areaErr } = await supabaseAdmin
      .from("clinical_areas")
      .select("id,name,code")
      .eq("id", clinicalAreaIdRaw)
      .eq("is_active", true)
      .maybeSingle();

    if (areaErr) return fail(humanizePostgrestRlsError(areaErr.message));
    if (!areaRow) return fail("Area non valida o non attiva.");

    const area = areaRow as { id: string; name: string; code: string };

    if (item.clinical_area_id === area.id) {
      return { ok: true };
    }

    let dupQuery = supabaseAdmin
      .from("shift_items")
      .select("id")
      .eq("plan_id", planId)
      .eq("shift_date", item.shift_date)
      .eq("kind", "sala")
      .eq("period", item.period)
      .eq("clinical_area_id", area.id)
      .neq("id", shiftItemId);
    dupQuery = item.assignment_location_id
      ? dupQuery.eq("assignment_location_id", item.assignment_location_id)
      : dupQuery.is("assignment_location_id", null);

    const { data: dup, error: dupErr } = await dupQuery.maybeSingle();

    if (dupErr) return fail(humanizePostgrestRlsError(dupErr.message));
    if (dup) {
      return fail("Quest’area è già presente per questo giorno, fascia e sala selezionate.");
    }

    const displayName = area.name;
    const { error: updErr } = await supabaseAdmin
      .from("shift_items")
      .update({
        clinical_area_id: area.id,
        label: displayName,
        specialty: displayName,
      })
      .eq("id", shiftItemId);

    if (updErr) return fail(humanizePostgrestRlsError(updErr.message));

    try {
      await insertPlanningChangeLogs([
        {
          planning_month_id: planId,
          shift_id: shiftItemId,
          actor_user_id: profile.id,
          action: "updated",
          before_data: { clinical_area_id: item.clinical_area_id, label: item.label, specialty: item.specialty },
          after_data: { clinical_area_id: area.id, label: displayName, specialty: displayName },
        },
      ]);
    } catch (auditError) {
      console.error("update_planning_slot_area audit failed", {
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

export async function updatePlanningSlotAssignmentLocationAction(
  _prevState: UpdatePlanningSlotAssignmentLocationState | null,
  formData: FormData,
): Promise<UpdatePlanningSlotAssignmentLocationState> {
  const profile = await requireUser();
  const fail = (message: string): UpdatePlanningSlotAssignmentLocationState => ({ ok: false, error: message });

  const shiftItemId = String(formData.get("shiftItemId") ?? "").trim();
  const planId = String(formData.get("planId") ?? "").trim();
  const month = String(formData.get("month") ?? "").trim();
  const assignmentLocationIdRaw = String(formData.get("assignmentLocationId") ?? "").trim();

  if (!yearMonthSchema.safeParse(month).success) return fail("Mese non valido.");

  try {
    yearMonthSchema.parse(month);
    z.string().uuid().parse(shiftItemId);
    z.string().uuid().parse(planId);
    z.string().uuid().parse(assignmentLocationIdRaw);

    if (profile.role !== "admin") {
      return fail("Solo gli amministratori possono modificare la sala o l’attività di uno slot.");
    }

    const supabaseAdmin = createServiceRoleSupabaseClient();

    const { data: itemRaw, error: itemErr } = await supabaseAdmin
      .from("shift_items")
      .select(
        "id,plan_id,shift_date,kind,period,clinical_area_id,assignment_location_id,label,specialty,room_name",
      )
      .eq("id", shiftItemId)
      .maybeSingle();

    if (itemErr) return fail(humanizePostgrestRlsError(itemErr.message));
    if (!itemRaw) return fail("Turno non trovato.");

    const item = itemRaw as {
      id: string;
      plan_id: string;
      shift_date: string;
      kind: string;
      period: string;
      clinical_area_id: string | null;
      assignment_location_id: string | null;
      label: string;
      specialty: string | null;
      room_name: string | null;
    };

    if (item.plan_id !== planId) return fail("Turno non appartenente al piano.");
    if (item.kind !== "sala") return fail("Solo gli slot in sala hanno una sala o attività assegnabile.");

    const { data: planRaw, error: planErr } = await supabaseAdmin
      .from("monthly_shift_plans")
      .select("id,year,month,status")
      .eq("id", planId)
      .maybeSingle();

    if (planErr) return fail(humanizePostgrestRlsError(planErr.message));
    if (!planRaw) return fail("Piano non trovato.");

    const planRow = planRaw as { status: string; year: number; month: number };
    if (!planCalendarMatchesYearMonth(planRow.year, planRow.month, month)) {
      return fail("Il mese non corrisponde al piano.");
    }
    if (planRow.status !== "draft") {
      return fail("Modifica sala solo con il piano in bozza.");
    }

    const { data: locRow, error: locErr } = await supabaseAdmin
      .from("assignment_locations")
      .select("id,name,is_active")
      .eq("id", assignmentLocationIdRaw)
      .eq("is_active", true)
      .maybeSingle();

    if (locErr) return fail(humanizePostgrestRlsError(locErr.message));
    if (!locRow) return fail("Sala o attività non valida o non attiva.");

    const loc = locRow as { id: string; name: string; is_active: boolean };

    if (item.assignment_location_id === loc.id) {
      return { ok: true };
    }

    const { data: dup, error: dupErr } = await supabaseAdmin
      .from("shift_items")
      .select("id")
      .eq("plan_id", planId)
      .eq("shift_date", item.shift_date)
      .eq("kind", "sala")
      .eq("period", item.period)
      .eq("assignment_location_id", loc.id)
      .neq("id", shiftItemId)
      .maybeSingle();

    if (dupErr) return fail(humanizePostgrestRlsError(dupErr.message));
    if (dup) {
      return fail("Questa sala o attività è già presente per questo giorno e fascia oraria.");
    }

    const { error: updErr } = await supabaseAdmin
      .from("shift_items")
      .update({
        assignment_location_id: loc.id,
        room_name: loc.name,
      })
      .eq("id", shiftItemId);

    if (updErr) return fail(humanizePostgrestRlsError(updErr.message));

    try {
      await insertPlanningChangeLogs([
        {
          planning_month_id: planId,
          shift_id: shiftItemId,
          actor_user_id: profile.id,
          action: "updated",
          before_data: { assignment_location_id: item.assignment_location_id, room_name: item.room_name },
          after_data: { assignment_location_id: loc.id, room_name: loc.name },
        },
      ]);
    } catch (auditError) {
      console.error("update_planning_slot_location audit failed", {
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
  if (profile.role !== "admin") {
    redirect(withQuery(month, { error: "Solo l’amministratore può inviare il piano mese" }));
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

export async function publishMonthlyShiftsPlanAction(formData: FormData) {
  const profile = await requireUser();
  if (profile.role !== "admin") {
    const month = String(formData.get("month") ?? "");
    if (yearMonthSchema.safeParse(month).success) {
      redirect(withQuery(month, { error: "Solo l’amministratore può pubblicare i turni" }));
    }
    redirect("/turni");
  }

  const planId = String(formData.get("planId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!planId || !month) redirect("/turni");
  if (!yearMonthSchema.safeParse(month).success) redirect("/turni");

  try {
    await publishMonthlyShiftsPlan(planId, profile.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    redirect(withQuery(month, { error: msg }));
  }
  revalidatePath("/turni");
  redirect(withQuery(month, { ok: "plan_published" }));
}
