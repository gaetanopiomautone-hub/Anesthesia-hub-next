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
export async function getMonthlyShiftPlanByYearMonth(params: { year: number; month: number }): Promise<MonthlyShiftPlanRow | null> {
  const supabase = await createServerSupabaseClient();
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
