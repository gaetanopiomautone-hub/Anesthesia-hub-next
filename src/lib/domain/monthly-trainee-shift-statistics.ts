/**
 * Statistiche mensili per specializzando sul planning (sala/ambulatorio/reper).
 * Ore assistenziali allineate a `weekly-assistential-hours.ts` (reper = 0h).
 */

import { isWeekend, parseISO } from "date-fns";

import type { PlanningAssistentialConflict } from "@/lib/domain/planning-assistential-conflicts";
import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";
import {
  ASSISTENTIAL_HALF_DAY_HOURS,
  type WeeklyAssistentialLoadRow,
  assistentialHalfDayUnits,
} from "@/lib/domain/weekly-assistential-hours";

const DAY = (s: string) => s.trim().slice(0, 10);

export type LocationHalfDayBreakdown = {
  locationLabel: string;
  halfDays: number;
};

export type MonthlyTraineeShiftStatisticsRow = {
  userId: string;
  userName: string;
  /** Ore assistenziali nel mese (solo sala/amb., ×6h per mezza giornata). */
  assistentialHoursMonth: number;
  assistentialHalfDays: number;
  morningShifts: number;
  afternoonShifts: number;
  /** Righe con periodo `giornata` (sala/amb.). */
  fullDayShifts: number;
  reperShifts: number;
  /** Giorni di sabato o domenica con almeno un turno assistenziale o reper (conteggio giorni, non turni). */
  weekendDaysWorked: number;
  conflictsCount: number;
  /** Numero di settimane (lun–dom) in cui, sui dati del mese, le ore superano 36h. */
  weeksOver36HoursCount: number;
  /** True se almeno una settimana dello specializzando esce dai bordi del mese (totale 36h parziale). */
  hasPartialWeekAtMonthEdge: boolean;
  locationHalfDays: LocationHalfDayBreakdown[];
};

function locationLabelForDistribution(item: ShiftItemRow): string {
  if (item.kind !== "sala" && item.kind !== "ambulatorio") return "";
  return (
    item.assignment_location?.name?.trim() ||
    item.room_name?.trim() ||
    item.label?.trim() ||
    "—"
  );
}

function itemInMonth(item: ShiftItemRow, monthStart: string, monthEnd: string): boolean {
  const d = DAY(item.shift_date);
  return d >= DAY(monthStart) && d <= DAY(monthEnd);
}

/** Utenti con almeno un `shift_item` assegnato nel mese. */
export function collectTraineeIdsWithAssignmentsInMonth(
  items: ShiftItemRow[],
  monthStart: string,
  monthEnd: string,
  preferredOrder: string[],
): string[] {
  const set = new Set<string>();
  for (const i of items) {
    if (!i.assigned_to) continue;
    if (!itemInMonth(i, monthStart, monthEnd)) continue;
    set.add(i.assigned_to);
  }
  const out: string[] = [];
  for (const id of preferredOrder) {
    if (set.has(id)) out.push(id);
  }
  for (const id of set) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function countWeeksExceedingAssistentialCapForUser(
  loads: WeeklyAssistentialLoadRow[],
  userId: string,
): number {
  return loads.filter((r) => r.userId === userId && r.exceeded).length;
}

export function userHasWeeklyLoadPartialAtMonthEdge(
  loads: WeeklyAssistentialLoadRow[],
  userId: string,
  monthStart: string,
  monthEnd: string,
): boolean {
  const ms = DAY(monthStart);
  const me = DAY(monthEnd);
  return loads.some(
    (r) => r.userId === userId && (DAY(r.weekStart) < ms || DAY(r.weekEnd) > me),
  );
}

/**
 * Giorni weekend (sab/dom) con almeno un turno assistenziale o reper.
 */
export function weekendWorkedDaysInMonthForUser(
  items: ShiftItemRow[],
  userId: string,
  monthStart: string,
  monthEnd: string,
): number {
  const dates = new Set<string>();
  for (const item of items) {
    if (item.assigned_to !== userId) continue;
    if (!itemInMonth(item, monthStart, monthEnd)) continue;
    const d = parseISO(DAY(item.shift_date));
    if (Number.isNaN(d.getTime()) || !isWeekend(d)) continue;
    if (item.kind === "reperibilita" || item.kind === "sala" || item.kind === "ambulatorio") {
      dates.add(DAY(item.shift_date));
    }
  }
  return dates.size;
}

export function conflictCountForTrainee(conflicts: PlanningAssistentialConflict[], userId: string): number {
  return conflicts.filter((c) => c.assigneeId === userId).length;
}

export function buildMonthlyTraineeShiftStatistics(params: {
  items: ShiftItemRow[];
  monthStart: string;
  monthEnd: string;
  conflicts: PlanningAssistentialConflict[];
  weeklyLoads: WeeklyAssistentialLoadRow[];
  userIds: string[];
  nameById: (userId: string) => string;
}): MonthlyTraineeShiftStatisticsRow[] {
  const { items, monthStart, monthEnd, conflicts, weeklyLoads, userIds, nameById } = params;
  const rows: MonthlyTraineeShiftStatisticsRow[] = [];

  for (const userId of userIds) {
    const userItems = items.filter(
      (i) => i.assigned_to === userId && itemInMonth(i, monthStart, monthEnd),
    );

    let assistentialHalfDays = 0;
    let morningShifts = 0;
    let afternoonShifts = 0;
    let fullDayShifts = 0;
    let reperShifts = 0;
    const locMap = new Map<string, number>();

    for (const item of userItems) {
      if (item.kind === "reperibilita") {
        reperShifts += 1;
        continue;
      }
      if (item.kind !== "sala" && item.kind !== "ambulatorio") continue;

      const units = assistentialHalfDayUnits(item);
      assistentialHalfDays += units;

      if (item.period === "giornata") {
        fullDayShifts += 1;
      } else if (item.period === "mattina") {
        morningShifts += 1;
      } else if (item.period === "pomeriggio") {
        afternoonShifts += 1;
      }

      const loc = locationLabelForDistribution(item);
      if (loc && units > 0) {
        locMap.set(loc, (locMap.get(loc) ?? 0) + units);
      }
    }

    const locationHalfDays: LocationHalfDayBreakdown[] = [...locMap.entries()]
      .map(([locationLabel, halfDays]) => ({ locationLabel, halfDays }))
      .sort((a, b) => a.locationLabel.localeCompare(b.locationLabel, "it"));

    rows.push({
      userId,
      userName: nameById(userId),
      assistentialHoursMonth: assistentialHalfDays * ASSISTENTIAL_HALF_DAY_HOURS,
      assistentialHalfDays,
      morningShifts,
      afternoonShifts,
      fullDayShifts,
      reperShifts,
      weekendDaysWorked: weekendWorkedDaysInMonthForUser(items, userId, monthStart, monthEnd),
      conflictsCount: conflictCountForTrainee(conflicts, userId),
      weeksOver36HoursCount: countWeeksExceedingAssistentialCapForUser(weeklyLoads, userId),
      hasPartialWeekAtMonthEdge: userHasWeeklyLoadPartialAtMonthEdge(
        weeklyLoads,
        userId,
        monthStart,
        monthEnd,
      ),
      locationHalfDays,
    });
  }

  return rows.sort((a, b) => a.userName.localeCompare(b.userName, "it") || a.userId.localeCompare(b.userId));
}
