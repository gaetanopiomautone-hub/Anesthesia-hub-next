import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { MonthlyShiftPlanStatus } from "@/lib/domain/monthly-shifts";

export type TurniShiftPlanMonthState =
  | { variant: "none" }
  | { variant: "published" }
  | { variant: "internal"; plan_id: string; plan_status: MonthlyShiftPlanStatus };

const PLAN_STATUSES: MonthlyShiftPlanStatus[] = ["draft", "submitted", "approved"];

function parsePlanStatus(raw: unknown): MonthlyShiftPlanStatus | null {
  if (typeof raw !== "string") return null;
  return PLAN_STATUSES.includes(raw as MonthlyShiftPlanStatus) ? (raw as MonthlyShiftPlanStatus) : null;
}

/** Normalizza il JSON restituito da `public.turni_shift_plan_month_state` (PostgREST / supabase-js). */
export function parseTurniShiftPlanMonthStateRpcPayload(data: unknown): TurniShiftPlanMonthState {
  const raw = data as Record<string, unknown> | null | undefined;
  if (raw == null || typeof raw !== "object") {
    return { variant: "none" };
  }
  const variant = raw.variant;
  if (variant === "none") return { variant: "none" };
  if (variant === "published") return { variant: "published" };
  if (variant === "internal") {
    const planId = typeof raw.plan_id === "string" ? raw.plan_id : null;
    const planStatus = parsePlanStatus(raw.plan_status);
    if (planId && planStatus) {
      return { variant: "internal", plan_id: planId, plan_status: planStatus };
    }
  }

  return { variant: "none" };
}

/**
 * Metadati mese per specializzando quando `monthly_shift_plans` non è leggibile via RLS (piano non pubblicato).
 * RPC `security definer` lato DB.
 */
export async function getTurniShiftPlanMonthState(year: number, month: number): Promise<TurniShiftPlanMonthState> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("turni_shift_plan_month_state", {
    plan_year: year,
    plan_month: month,
  });

  if (error) {
    throw new Error(`turni_shift_plan_month_state: ${error.message}`);
  }

  return parseTurniShiftPlanMonthStateRpcPayload(data);
}
