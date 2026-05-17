/**
 * Sintesi per cella calendario del planning mensile (solo UI).
 */

import { eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from "date-fns";

import type { PlanningAssistentialConflict } from "@/lib/domain/planning-assistential-conflicts";
import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

export type DayFillStatus = "empty" | "partial" | "complete" | "conflict";

export type MonthlyPlanDaySummary = {
  date: string;
  assignedCount: number;
  totalSlots: number;
  salaTotal: number;
  salaAssigned: number;
  reperTotal: number;
  reperAssigned: number;
  ambTotal: number;
  conflictCount: number;
  hasWeeklyCapWarning: boolean;
  fillStatus: DayFillStatus;
};

export function buildCalendarWeeksForMonth(monthAnchor: Date): Date[][] {
  const monthStart = startOfMonth(monthAnchor);
  const monthEnd = endOfMonth(monthAnchor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

export function buildMonthlyPlanDaySummaries(params: {
  items: ShiftItemRow[];
  monthStart: string;
  monthEnd: string;
  conflicts: PlanningAssistentialConflict[];
  weeklyExcessUserIds: Set<string>;
}): Map<string, MonthlyPlanDaySummary> {
  const { items, monthStart, monthEnd, conflicts, weeklyExcessUserIds } = params;
  const byDate = new Map<string, ShiftItemRow[]>();

  for (const item of items) {
    const d = item.shift_date.trim().slice(0, 10);
    if (d < monthStart || d > monthEnd) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(item);
  }

  const conflictCountByDate = new Map<string, number>();
  for (const c of conflicts) {
    const d = c.shiftDate.trim().slice(0, 10);
    conflictCountByDate.set(d, (conflictCountByDate.get(d) ?? 0) + 1);
  }

  const monthStartDate = new Date(`${monthStart}T12:00:00`);
  const monthEndDate = new Date(`${monthEnd}T12:00:00`);
  const allDaysInMonth = eachDayOfInterval({ start: monthStartDate, end: monthEndDate });

  const out = new Map<string, MonthlyPlanDaySummary>();

  for (const day of allDaysInMonth) {
    const date = format(day, "yyyy-MM-dd");
    const dayItems = byDate.get(date) ?? [];
    const { a, t } = countAssigned(dayItems);
    const salaItems = dayItems.filter((i) => i.kind === "sala");
    const salaAssigned = salaItems.filter((i) => i.assigned_to).length;
    const reperItems = dayItems.filter((i) => i.kind === "reperibilita");
    const reperAssigned = reperItems.filter((i) => i.assigned_to).length;
    const ambTotal = dayItems.filter((i) => i.kind === "ambulatorio").length;
    const conflictCount = conflictCountByDate.get(date) ?? 0;
    const hasWeeklyCapWarning = dayItems.some(
      (i) => i.assigned_to && weeklyExcessUserIds.has(i.assigned_to),
    );

    let fillStatus: DayFillStatus;
    if (conflictCount > 0) {
      fillStatus = "conflict";
    } else if (t === 0) {
      fillStatus = "empty";
    } else if (a === t) {
      fillStatus = "complete";
    } else if (a > 0) {
      fillStatus = "partial";
    } else {
      fillStatus = "empty";
    }

    out.set(date, {
      date,
      assignedCount: a,
      totalSlots: t,
      salaTotal: salaItems.length,
      salaAssigned,
      reperTotal: reperItems.length,
      reperAssigned,
      ambTotal,
      conflictCount,
      hasWeeklyCapWarning,
      fillStatus,
    });
  }

  return out;
}

function countAssigned(rows: ShiftItemRow[]): { a: number; t: number } {
  const t = rows.length;
  const a = rows.filter((i) => i.assigned_to).length;
  return { a, t };
}
