import type { SupabaseClient } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MonthlyShiftPlanRow, ShiftItemRow } from "@/lib/domain/monthly-shifts";

function mapPlan(raw: Record<string, unknown>): MonthlyShiftPlanRow {
  return {
    id: String(raw.id ?? ""),
    year: Number(raw.year ?? 0),
    month: Number(raw.month ?? 0),
    status: (raw.status as MonthlyShiftPlanRow["status"]) ?? "draft",
    created_by: raw.created_by ? String(raw.created_by) : null,
    submitted_at: raw.submitted_at ? String(raw.submitted_at) : null,
    approved_by: raw.approved_by ? String(raw.approved_by) : null,
    approved_at: raw.approved_at ? String(raw.approved_at) : null,
    reopened_at: raw.reopened_at ? String(raw.reopened_at) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

function mapItem(raw: Record<string, unknown>): ShiftItemRow {
  return {
    id: String(raw.id ?? ""),
    plan_id: String(raw.plan_id ?? ""),
    shift_date: String(raw.shift_date ?? "").trim(),
    kind: (raw.kind as ShiftItemRow["kind"]) ?? "sala",
    period: (raw.period as ShiftItemRow["period"]) ?? "mattina",
    start_time: raw.start_time != null ? String(raw.start_time) : null,
    end_time: raw.end_time != null ? String(raw.end_time) : null,
    label: String(raw.label ?? ""),
    room_name: raw.room_name != null ? String(raw.room_name) : null,
    specialty: raw.specialty != null ? String(raw.specialty) : null,
    source: (raw.source as ShiftItemRow["source"]) ?? "generated",
    assigned_to: raw.assigned_to ? String(raw.assigned_to) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

/** Piano per anno/mese, se esiste. */
export async function getMonthlyShiftPlanByYearMonth(params: {
  year: number;
  month: number;
  /** Opzionale: usare ad es. service role in operazioni server-only (import batch). */
  supabase?: SupabaseClient;
}): Promise<MonthlyShiftPlanRow | null> {
  const supabase = params.supabase ?? (await createServerSupabaseClient());
  const { data, error } = await supabase
    .from("monthly_shift_plans")
    .select("*")
    .eq("year", params.year)
    .eq("month", params.month)
    .maybeSingle();

  if (error) {
    throw new Error(`monthly_shift_plans query failed: ${error.message}`);
  }
  if (!data) return null;
  return mapPlan(data as Record<string, unknown>);
}

/** Tutte le righe turno di un piano, ordinate per data. */
export async function listShiftItemsByPlanId(planId: string): Promise<ShiftItemRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shift_items")
    .select("*")
    .eq("plan_id", planId)
    .order("shift_date", { ascending: true });

  if (error) {
    throw new Error(`shift_items query failed: ${error.message}`);
  }
  return (data ?? []).map((r) => mapItem(r as Record<string, unknown>));
}

export async function getShiftItemById(shiftItemId: string): Promise<ShiftItemRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("shift_items").select("*").eq("id", shiftItemId).maybeSingle();
  if (error) {
    throw new Error(`shift_items by id: ${error.message}`);
  }
  if (!data) return null;
  return mapItem(data as Record<string, unknown>);
}

/** Altre righe stesso piano/data già assegnate a `userId` (es. per vincolo “no doppia sala+amb stesso giorno”). */
export async function listShiftItemsSamePlanDateUserExcluding(
  planId: string,
  shiftDate: string,
  userId: string,
  excludeShiftItemId: string,
): Promise<ShiftItemRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shift_items")
    .select("*")
    .eq("plan_id", planId)
    .eq("shift_date", shiftDate)
    .eq("assigned_to", userId)
    .neq("id", excludeShiftItemId);

  if (error) {
    throw new Error(`shift_items same day user: ${error.message}`);
  }
  return (data ?? []).map((r) => mapItem(r as Record<string, unknown>));
}

export async function getMonthlyShiftPlanById(planId: string): Promise<MonthlyShiftPlanRow | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("monthly_shift_plans").select("*").eq("id", planId).maybeSingle();
  if (error) {
    throw new Error(`monthly_shift_plans by id: ${error.message}`);
  }
  if (!data) return null;
  return mapPlan(data as Record<string, unknown>);
}

/**
 * Assegna un operatore a una riga `shift_items`. Rispetta RLS; a livello app non si modifica se il piano è `approved`.
 */
export async function updateShiftAssignment(shiftItemId: string, userId: string | null) {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("shift_items")
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq("id", shiftItemId);

  if (error) throw new Error(error.message);
}

export async function submitMonthlyPlan(planId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("monthly_shift_plans")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("status", "draft")
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Nessun piano in bozza aggiornato (già inviato o inesistente).");
}

export async function approveMonthlyPlan(planId: string, userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("monthly_shift_plans")
    .update({
      status: "approved",
      approved_by: userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .in("status", ["draft", "submitted"])
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Approvazione non possibile: stato del piano inatteso o già approvato.");
}

export async function reopenMonthlyPlan(planId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("monthly_shift_plans")
    .update({
      status: "draft",
      reopened_at: new Date().toISOString(),
      approved_by: null,
      approved_at: null,
    })
    .eq("id", planId)
    .eq("status", "approved")
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Riapertura non possibile: il piano non è in stato approvato.");
}
