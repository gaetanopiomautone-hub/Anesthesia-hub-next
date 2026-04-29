"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

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
