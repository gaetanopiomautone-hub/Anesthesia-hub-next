/**
 * Riepilogo settimanale (lun–dom) per specializzando, esploso giorno per giorno.
 * Riutilizzabile da dashboard specializzando e (futuro) PDF.
 *
 * Dati tipicamente limitati al mese corrente: settimane a cavallo del mese possono
 * mostrare giorni fuori mese vuoti e totali ore parziali rispetto al calendario reale.
 */

import { addDays, eachDayOfInterval, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

import type { PlanningAssistentialConflict, PlanningBlockInput, PlanningLeaveRangeInput } from "@/lib/domain/planning-assistential-conflicts";
import {
  isLeaveStatusConflicting,
  normalizeLeaveRequestType,
  shiftDateInInclusiveLeaveRange,
} from "@/lib/domain/planning-assistential-conflicts";
import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";
import { shiftItemKindLabelItalian, shiftItemPeriodLabelItalian } from "@/lib/domain/monthly-shifts";
import {
  ASSISTENTIAL_HALF_DAY_HOURS,
  WEEKLY_ASSISTENTIAL_CAP_HOURS,
  assistentialHalfDayUnits,
  weekRangeMondaySunday,
} from "@/lib/domain/weekly-assistential-hours";

export type TraineeWeekSummaryEntryCategory =
  | "assistential"
  | "reper"
  | "ferie"
  | "desiderata_leave"
  | "didattica"
  | "congresso"
  | "desiderata_block"
  | "altro";

export type TraineeWeekSummaryEntry = {
  id: string;
  category: TraineeWeekSummaryEntryCategory;
  label: string;
  shiftItemId?: string;
  /** Mezze giornate assistenziali (0, 1, 2) — solo `assistential` e turni sala/amb. */
  assistentialHalfDays: number;
};

export type TraineeWeekSummaryDay = {
  date: string;
  weekdayLabel: string;
  /** Giorno incluso nel mese visualizzato (false = cella grigia / fuori range dati). */
  isInVisibleMonth: boolean;
  morningItems: TraineeWeekSummaryEntry[];
  afternoonItems: TraineeWeekSummaryEntry[];
  fullDayItems: TraineeWeekSummaryEntry[];
  reperItems: TraineeWeekSummaryEntry[];
  conflictMessages: string[];
  assistentialDayHours: number;
};

export type TraineeWeeklyPlanningWeek = {
  weekStart: string;
  weekEnd: string;
  /** True se la settimana ISO non è interamente dentro [monthStart, monthEnd]. */
  partialWeekOutOfMonth: boolean;
  totalAssistentialHours: number;
  reperCount: number;
  exceededWeeklyCap: boolean;
  weekHasConflicts: boolean;
  days: TraineeWeekSummaryDay[];
};

export type TraineeWeeklyPlanningSummaryRow = {
  userId: string;
  userName: string;
  weeks: TraineeWeeklyPlanningWeek[];
};

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function shiftDisplayLabel(item: ShiftItemRow): string {
  const loc =
    item.assignment_location?.name?.trim() ||
    item.room_name?.trim() ||
    item.label?.trim() ||
    "—";
  return `${shiftItemKindLabelItalian(item.kind)} · ${shiftItemPeriodLabelItalian(item.period)} · ${loc}`;
}

function blockCategory(kind: string): TraineeWeekSummaryEntryCategory {
  const k = String(kind ?? "").trim().toLowerCase();
  if (k === "didattica") return "didattica";
  if (k === "congresso") return "congresso";
  if (k === "desiderata") return "desiderata_block";
  if (k === "ferie") return "ferie";
  return "altro";
}

function blockTitle(block: PlanningBlockInput): string {
  const t = block.title?.trim();
  if (t) return t;
  const n = block.note?.trim();
  if (n) return n;
  return "Blocco";
}

function leaveTypeLabel(requestType: string): string {
  const ak = normalizeLeaveRequestType(requestType);
  if (ak === "ferie") return "Ferie";
  if (ak === "desiderata") return "Desiderata (richiesta)";
  return "Richiesta";
}

export function collectTraineeWeeklySummaryUserIds(params: {
  items: ShiftItemRow[];
  leaves: PlanningLeaveRangeInput[];
  blocks: PlanningBlockInput[];
  /** Ordine preferito (es. `assigneeOptions.map((o) => o.id)`). */
  preferredOrder: string[];
}): string[] {
  const set = new Set<string>();
  for (const i of params.items) {
    if (i.assigned_to) set.add(i.assigned_to);
  }
  for (const b of params.blocks) {
    if (b.userId) set.add(b.userId);
  }
  for (const l of params.leaves) {
    if (l.userId) set.add(l.userId);
  }
  const out: string[] = [];
  for (const id of params.preferredOrder) {
    if (set.has(id)) out.push(id);
  }
  for (const id of set) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function buildDayForUser(params: {
  userId: string;
  dateStr: string;
  monthStart: string;
  monthEnd: string;
  items: ShiftItemRow[];
  leaves: PlanningLeaveRangeInput[];
  blocks: PlanningBlockInput[];
  conflicts: PlanningAssistentialConflict[];
}): TraineeWeekSummaryDay {
  const { userId, dateStr, monthStart, monthEnd, items, leaves, blocks, conflicts } = params;
  const isInVisibleMonth = dateStr >= monthStart && dateStr <= monthEnd;
  const d = parseISO(dateStr);
  const weekdayLabel = format(d, "EEE d MMM", { locale: it });

  const morningItems: TraineeWeekSummaryEntry[] = [];
  const afternoonItems: TraineeWeekSummaryEntry[] = [];
  const fullDayItems: TraineeWeekSummaryEntry[] = [];
  const reperItems: TraineeWeekSummaryEntry[] = [];

  const dayShiftItems = items.filter(
    (i) => i.assigned_to === userId && i.shift_date.trim().slice(0, 10) === dateStr,
  );
  dayShiftItems.sort((a, b) => a.kind.localeCompare(b.kind) || a.period.localeCompare(b.period));

  for (const item of dayShiftItems) {
    if (item.kind === "reperibilita") {
      reperItems.push({
        id: `shift-${item.id}`,
        category: "reper",
        label: `Reperibilità · ${shiftItemPeriodLabelItalian(item.period)}`,
        shiftItemId: item.id,
        assistentialHalfDays: 0,
      });
      continue;
    }
    const half = assistentialHalfDayUnits(item);
    const entry: TraineeWeekSummaryEntry = {
      id: `shift-${item.id}`,
      category: "assistential",
      label: shiftDisplayLabel(item),
      shiftItemId: item.id,
      assistentialHalfDays: half,
    };
    if (item.period === "giornata") {
      fullDayItems.push(entry);
    } else if (item.period === "mattina") {
      morningItems.push(entry);
    } else if (item.period === "pomeriggio") {
      afternoonItems.push(entry);
    } else {
      fullDayItems.push(entry);
    }
  }

  for (const leave of leaves) {
    if (!leave.userId || leave.userId !== userId) continue;
    if (!isLeaveStatusConflicting(leave.status)) continue;
    if (!shiftDateInInclusiveLeaveRange(dateStr, leave.startDate, leave.endDate)) continue;
    const nrt = normalizeLeaveRequestType(leave.requestType);
    const cat: TraineeWeekSummaryEntryCategory =
      nrt === "desiderata" ? "desiderata_leave" : nrt === "ferie" ? "ferie" : "altro";
    fullDayItems.push({
      id: `leave-${leave.id}-${dateStr}`,
      category: cat,
      label: leaveTypeLabel(leave.requestType),
      assistentialHalfDays: 0,
    });
  }

  for (const block of blocks) {
    if (block.userId !== userId) continue;
    if (String(block.blockDate).trim().slice(0, 10) !== dateStr) continue;
    const cat = blockCategory(block.kind);
    const label = `${blockTitle(block)} (${block.period === "morning" ? "mattina" : block.period === "afternoon" ? "pomeriggio" : "tutto il giorno"})`;
    const entry: TraineeWeekSummaryEntry = {
      id: `block-${block.id}`,
      category: cat,
      label,
      assistentialHalfDays: 0,
    };
    if (block.period === "full_day") {
      fullDayItems.push(entry);
    } else if (block.period === "morning") {
      morningItems.push(entry);
    } else if (block.period === "afternoon") {
      afternoonItems.push(entry);
    } else {
      fullDayItems.push(entry);
    }
  }

  const assistentialDayHours = dayShiftItems
    .filter((i) => i.kind !== "reperibilita")
    .reduce((sum, i) => sum + assistentialHalfDayUnits(i) * ASSISTENTIAL_HALF_DAY_HOURS, 0);

  const conflictMessages = uniqueStrings(
    conflicts.filter((c) => c.assigneeId === userId && c.shiftDate === dateStr).map((c) => c.shortMessage),
  );

  return {
    date: dateStr,
    weekdayLabel,
    isInVisibleMonth,
    morningItems,
    afternoonItems,
    fullDayItems,
    reperItems,
    conflictMessages,
    assistentialDayHours,
  };
}

function distinctWeekStartsInMonth(monthStart: string, monthEnd: string): string[] {
  const start = parseISO(monthStart);
  const end = parseISO(monthEnd);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of eachDayOfInterval({ start, end })) {
    const ds = format(d, "yyyy-MM-dd");
    const { weekStart } = weekRangeMondaySunday(ds);
    if (!seen.has(weekStart)) {
      seen.add(weekStart);
      out.push(weekStart);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function buildWeekForUser(params: {
  userId: string;
  weekStart: string;
  monthStart: string;
  monthEnd: string;
  items: ShiftItemRow[];
  leaves: PlanningLeaveRangeInput[];
  blocks: PlanningBlockInput[];
  conflicts: PlanningAssistentialConflict[];
}): TraineeWeeklyPlanningWeek {
  const { userId, weekStart, monthStart, monthEnd, items, leaves, blocks, conflicts } = params;
  const { weekEnd } = weekRangeMondaySunday(weekStart);
  const partialWeekOutOfMonth = weekStart < monthStart || weekEnd > monthEnd;

  const days: TraineeWeekSummaryDay[] = [];
  const ws = parseISO(weekStart);
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const dateStr = format(d, "yyyy-MM-dd");
    days.push(
      buildDayForUser({
        userId,
        dateStr,
        monthStart,
        monthEnd,
        items,
        leaves,
        blocks,
        conflicts,
      }),
    );
  }

  let totalAssistentialHours = 0;
  let reperCount = 0;
  let weekHasConflicts = false;
  for (const day of days) {
    totalAssistentialHours += day.assistentialDayHours;
    if (day.conflictMessages.length > 0) weekHasConflicts = true;
  }

  for (const item of items) {
    if (item.assigned_to !== userId) continue;
    if (item.kind !== "reperibilita") continue;
    const ds = item.shift_date.trim().slice(0, 10);
    if (ds < weekStart || ds > weekEnd) continue;
    reperCount += 1;
  }

  return {
    weekStart,
    weekEnd,
    partialWeekOutOfMonth,
    totalAssistentialHours,
    reperCount,
    exceededWeeklyCap: totalAssistentialHours > WEEKLY_ASSISTENTIAL_CAP_HOURS,
    weekHasConflicts,
    days,
  };
}

/**
 * Costruisce un riepilogo per ciascuno `userId` in `userIds` (tipicamente da
 * {@link collectTraineeWeeklySummaryUserIds}).
 */
export function buildTraineeWeeklyPlanningSummaries(params: {
  items: ShiftItemRow[];
  leaves: PlanningLeaveRangeInput[];
  blocks: PlanningBlockInput[];
  /** Output di {@link buildPlanningAssistentialConflicts} (o equivalente). */
  conflicts: PlanningAssistentialConflict[];
  nameById: (userId: string) => string;
  monthStart: string;
  monthEnd: string;
  userIds: string[];
}): TraineeWeeklyPlanningSummaryRow[] {
  const { items, leaves, blocks, conflicts, nameById, monthStart, monthEnd, userIds } = params;
  const weekStarts = distinctWeekStartsInMonth(monthStart, monthEnd);

  const rows: TraineeWeeklyPlanningSummaryRow[] = [];
  for (const userId of userIds) {
    const weeks: TraineeWeeklyPlanningWeek[] = weekStarts.map((ws) =>
      buildWeekForUser({
        userId,
        weekStart: ws,
        monthStart,
        monthEnd,
        items,
        leaves,
        blocks,
        conflicts,
      }),
    );
    rows.push({
      userId,
      userName: nameById(userId),
      weeks,
    });
  }

  return rows.sort((a, b) => a.userName.localeCompare(b.userName, "it") || a.userId.localeCompare(b.userId));
}
