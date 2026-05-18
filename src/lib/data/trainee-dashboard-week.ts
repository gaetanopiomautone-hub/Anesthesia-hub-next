import { endOfMonth, format, startOfMonth } from "date-fns";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { getMonthlyShiftPlanByYearMonth, listShiftItemsByPlanId } from "@/lib/data/monthly-shift-plans";
import { loadPlanningUnavailabilityForMonth } from "@/lib/data/planning-unavailability";
import { buildPlanningAssistentialConflicts } from "@/lib/domain/planning-assistential-conflicts";
import {
  buildTraineeWeeklyPlanningSummaries,
  type TraineeWeeklyPlanningWeek,
} from "@/lib/domain/trainee-weekly-planning-summary";
import { formatWeekRangeItalian, weekRangeMondaySunday } from "@/lib/domain/weekly-assistential-hours";

export type TraineeDashboardWeekPayload = {
  week: TraineeWeeklyPlanningWeek | null;
  monthStart: string;
  monthEnd: string;
  weekLabel: string;
  planAvailable: boolean;
};

export async function loadTraineeDashboardCurrentWeek(
  profile: CurrentUserProfile,
): Promise<TraineeDashboardWeekPayload | null> {
  if (profile.role !== "specializzando") return null;

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const { weekStart } = weekRangeMondaySunday(format(today, "yyyy-MM-dd"));
  const weekLabel = formatWeekRangeItalian(weekStart, weekRangeMondaySunday(weekStart).weekEnd);

  const plan = await getMonthlyShiftPlanByYearMonth({ year: y, month: m });
  if (!plan) {
    return { week: null, monthStart, monthEnd, weekLabel, planAvailable: false };
  }

  const items = await listShiftItemsByPlanId(plan.id);
  let leaves: Awaited<ReturnType<typeof loadPlanningUnavailabilityForMonth>>["leaves"] = [];
  let blocks: Awaited<ReturnType<typeof loadPlanningUnavailabilityForMonth>>["blocks"] = [];
  try {
    const u = await loadPlanningUnavailabilityForMonth({ monthStart, monthEnd });
    leaves = u.leaves;
    blocks = u.blocks;
  } catch {
    leaves = [];
    blocks = [];
  }

  const nameById = () => profile.nome?.trim() || profile.full_name?.trim() || "Tu";
  const conflicts = buildPlanningAssistentialConflicts({
    items,
    leaves,
    blocks,
    nameById,
  });

  const rows = buildTraineeWeeklyPlanningSummaries({
    items,
    leaves,
    blocks,
    conflicts,
    nameById,
    monthStart,
    monthEnd,
    userIds: [profile.id],
  });

  const week = rows[0]?.weeks.find((w) => w.weekStart === weekStart) ?? null;

  return { week, monthStart, monthEnd, weekLabel, planAvailable: true };
}
