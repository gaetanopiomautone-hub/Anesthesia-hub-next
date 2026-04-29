import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PlanningChangeAction = "created" | "updated" | "deleted" | "imported";

export type PlanningChangeLogRow = {
  id: string;
  planning_month_id: string;
  shift_id: string | null;
  actor_user_id: string | null;
  action: PlanningChangeAction;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  created_at: string;
};

function createServiceRoleSupabaseClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey);
}

export async function insertPlanningChangeLogs(
  rows: Array<{
    planning_month_id: string;
    shift_id: string | null;
    actor_user_id: string | null;
    action: PlanningChangeAction;
    before_data?: Record<string, unknown> | null;
    after_data?: Record<string, unknown> | null;
  }>,
) {
  if (!rows.length) return;
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.from("planning_change_log").insert(
    rows.map((r) => ({
      planning_month_id: r.planning_month_id,
      shift_id: r.shift_id,
      actor_user_id: r.actor_user_id,
      action: r.action,
      before_data: r.before_data ?? null,
      after_data: r.after_data ?? null,
    })),
  );
  if (error) {
    throw new Error(`planning_change_log insert failed: ${error.message}`);
  }
}

function mapLog(raw: Record<string, unknown>): PlanningChangeLogRow {
  return {
    id: String(raw.id ?? ""),
    planning_month_id: String(raw.planning_month_id ?? ""),
    shift_id: raw.shift_id ? String(raw.shift_id) : null,
    actor_user_id: raw.actor_user_id ? String(raw.actor_user_id) : null,
    action: (raw.action as PlanningChangeAction) ?? "updated",
    before_data: (raw.before_data as Record<string, unknown> | null) ?? null,
    after_data: (raw.after_data as Record<string, unknown> | null) ?? null,
    created_at: String(raw.created_at ?? ""),
  };
}

export async function listPlanningChangeLogsByPlanId(planId: string, limit = 200): Promise<PlanningChangeLogRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("planning_change_log")
    .select("*")
    .eq("planning_month_id", planId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(`planning_change_log query failed: ${error.message}`);
  }
  return (data ?? []).map((r) => mapLog(r as Record<string, unknown>));
}
