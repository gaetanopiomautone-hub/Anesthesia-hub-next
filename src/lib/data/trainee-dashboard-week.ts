import { endOfMonth, format, startOfMonth } from "date-fns";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { getMonthlyShiftPlanByYearMonth, listShiftItemsByPlanId } from "@/lib/data/monthly-shift-plans";
import { loadPlanningUnavailabilityForMonth } from "@/lib/data/planning-unavailability";
import { buildPlanningAssistentialConflicts } from "@/lib/domain/planning-assistential-conflicts";
import {
  buildTraineePlanningWeekForUser,
  traineePlanningWeekHasContent,
  type TraineeWeeklyPlanningWeek,
} from "@/lib/domain/trainee-weekly-planning-summary";
import { formatWeekRangeItalian, weekRangeMondaySunday } from "@/lib/domain/weekly-assistential-hours";

export type TraineeDashboardWeekPayload = {
  week: TraineeWeeklyPlanningWeek | null;
  monthStart: string;
  monthEnd: string;
  weekLabel: string;
  planAvailable: boolean;
  /** True se la settimana corrente ha almeno un turno/blocco/conflitto per l’utente. */
  hasWeekContent: boolean;
};

export async function loadTraineeDashboardCurrentWeek(
  profile: CurrentUserProfile,
): Promise<TraineeDashboardWeekPayload | null> {
  if (profile.role !== "specializzando") return null;

  const today = new Date();
  const todayYmd = format(today, "yyyy-MM-dd");
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const { weekStart, weekEnd } = weekRangeMondaySunday(todayYmd);
  const weekLabel = formatWeekRangeItalian(weekStart, weekEnd);

  const plan = await getMonthlyShiftPlanByYearMonth({ year: y, month: m });
  if (!plan) {
    return { week: null, monthStart, monthEnd, weekLabel, planAvailable: false, hasWeekContent: false };
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

  const week = buildTraineePlanningWeekForUser({
    userId: profile.id,
    weekStart,
    monthStart,
    monthEnd,
    items,
    leaves,
    blocks,
    conflicts,
  });

  return {
    week,
    monthStart,
    monthEnd,
    weekLabel,
    planAvailable: true,
    hasWeekContent: traineePlanningWeekHasContent(week),
  };
}
