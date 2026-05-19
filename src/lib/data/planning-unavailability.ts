import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { PlanningBlockInput, PlanningLeaveRangeInput } from "@/lib/domain/planning-assistential-conflicts";

function mapLeaveRaw(raw: Record<string, unknown>): PlanningLeaveRangeInput {
  return {
    id: String(raw.id ?? ""),
    userId: String(raw.user_id ?? "").trim(),
    requestType: String(raw.request_type ?? ""),
    startDate: String(raw.start_date ?? "").trim().slice(0, 10),
    endDate: String(raw.end_date ?? "").trim().slice(0, 10),
    status: String(raw.status ?? ""),
    note:
      raw.reason != null
        ? String(raw.reason)
        : raw.note != null
          ? String(raw.note)
          : null,
  };
}

function mapBlockRaw(raw: Record<string, unknown>): PlanningBlockInput {
  return {
    id: String(raw.id ?? ""),
    userId: String(raw.user_id ?? "").trim(),
    blockDate: String(raw.block_date ?? "").trim().slice(0, 10),
    period: String(raw.period ?? "full_day") as PlanningBlockInput["period"],
    kind: String(raw.kind ?? "altro"),
    title: String(raw.title ?? ""),
    note: raw.note != null ? String(raw.note) : null,
  };
}

/**
 * Richieste ferie/desiderata che intersecano il mese + blocchi giornalieri didattica/congresso/desiderata.
 * Usato dal planning `/turni` per conflitti assistenziali.
 */
export async function loadPlanningUnavailabilityForMonth(params: {
  monthStart: string;
  monthEnd: string;
}): Promise<{ leaves: PlanningLeaveRangeInput[]; blocks: PlanningBlockInput[] }> {
  const supabase = await createServerSupabaseClient();
  const { monthStart, monthEnd } = params;

  const { data: leaveRaw, error: leaveErr } = await supabase
    .from("leave_requests")
    .select("*")
    .lte("start_date", monthEnd)
    .gte("end_date", monthStart);

  if (leaveErr) {
    throw new Error(`leave_requests planning overlap: ${leaveErr.message}`);
  }

  let blocks: PlanningBlockInput[] = [];
  const { data: blockRaw, error: blockErr } = await supabase
    .from("trainee_planning_blocks")
    .select("id, user_id, block_date, period, kind, title, note")
    .gte("block_date", monthStart)
    .lte("block_date", monthEnd)
    .order("block_date", { ascending: true });

  if (blockErr) {
    if (/relation|does not exist|schema cache/i.test(blockErr.message)) {
      blocks = [];
    } else {
      throw new Error(`trainee_planning_blocks: ${blockErr.message}`);
    }
  } else {
    blocks = (blockRaw ?? []).map((r) => mapBlockRaw(r as Record<string, unknown>));
  }

  const leaves = (leaveRaw ?? []).map((r) => mapLeaveRaw(r as Record<string, unknown>));

  return { leaves, blocks };
}
