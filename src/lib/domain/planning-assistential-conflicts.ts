/**
 * Conflitti tra turni assistenziali mensili (`shift_items`) e indisponibilità
 * (intervalli `leave_requests` + blocchi giornalieri `trainee_planning_blocks`).
 * Solo warning lato UI; logica riutilizzabile per dashboard / PDF.
 */

import { shiftItemKindLabelItalian, shiftItemPeriodLabelItalian } from "@/lib/domain/monthly-shifts";
import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

/** Fascia giornaliera per confronti (allineato a DB `trainee_planning_blocks.period`). */
export type AssistentialDayPeriod = "morning" | "afternoon" | "full_day";

export type PlanningLeaveRangeInput = {
  id: string;
  userId: string;
  requestType: string;
  startDate: string;
  endDate: string;
  status: string;
  note: string | null;
};

export type PlanningBlockInput = {
  id: string;
  userId: string;
  blockDate: string;
  period: AssistentialDayPeriod;
  kind: string;
  title: string;
  note: string | null;
};

export type PlanningAssistentialConflict = {
  shiftItemId: string;
  shiftDate: string;
  assigneeId: string;
  assigneeName: string;
  shiftKindLabel: string;
  shiftPeriodLabel: string;
  locationLabel: string;
  activityKind: "ferie" | "desiderata" | "didattica" | "congresso" | "altro";
  activityLabel: string;
  activityPeriodLabel: string;
  /** Messaggio breve per riga turno */
  shortMessage: string;
};

export function isLeaveStatusConflicting(status: string): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "rejected" || s === "rifiutato" || s === "cancelled" || s === "annullato") return false;
  return s === "pending" || s === "approved" || s === "in_attesa" || s === "approvato";
}

export function normalizeLeaveRequestType(raw: string): PlanningAssistentialConflict["activityKind"] {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "ferie" || t === "vacation") return "ferie";
  if (t === "desiderata" || t === "permission") return "desiderata";
  return "altro";
}

/** Data turno inclusa in [start, end] (stringhe yyyy-MM-dd). */
export function shiftDateInInclusiveLeaveRange(shiftDate: string, startDate: string, endDate: string): boolean {
  const d = String(shiftDate ?? "").trim().slice(0, 10);
  const s = String(startDate ?? "").trim().slice(0, 10);
  const e = String(endDate ?? "").trim().slice(0, 10);
  if (!d || !s || !e) return false;
  return d >= s && d <= e;
}

/** Mattina / pomeriggio / giornata per righe assistenziali; `null` per reper o non mappabile. */
export function shiftItemAssistentialDayPeriod(item: ShiftItemRow): AssistentialDayPeriod | null {
  if (item.kind === "reperibilita") return null;
  if (item.kind === "sala") {
    if (item.period === "mattina") return "morning";
    if (item.period === "pomeriggio") return "afternoon";
    if (item.period === "giornata") return "full_day";
    return null;
  }
  if (item.kind === "ambulatorio") {
    if (item.period === "giornata") return "full_day";
    if (item.period === "mattina") return "morning";
    if (item.period === "pomeriggio") return "afternoon";
    return "full_day";
  }
  return null;
}

/**
 * Sovrapposizione tra due fasce nello stesso giorno.
 * `full_day` su un lato implica sovrapposizione con qualsiasi altra fascia.
 */
export function dayPeriodsOverlap(a: AssistentialDayPeriod, b: AssistentialDayPeriod): boolean {
  if (a === "full_day" || b === "full_day") return true;
  return a === b;
}

function locationLabelForShift(item: ShiftItemRow): string {
  return (
    item.assignment_location?.name?.trim() ||
    item.room_name?.trim() ||
    item.label?.trim() ||
    "—"
  );
}

function activityPeriodLabelForBlock(period: AssistentialDayPeriod): string {
  switch (period) {
    case "morning":
      return "mattina";
    case "afternoon":
      return "pomeriggio";
    case "full_day":
      return "tutto il giorno";
    default:
      return String(period);
  }
}

function activityKindLabelItalian(k: PlanningAssistentialConflict["activityKind"]): string {
  switch (k) {
    case "ferie":
      return "ferie";
    case "desiderata":
      return "desiderata";
    case "didattica":
      return "didattica / lezione";
    case "congresso":
      return "congresso";
    default:
      return "indisponibilità";
  }
}

function normalizeBlockKind(raw: string): PlanningAssistentialConflict["activityKind"] {
  const k = String(raw ?? "").trim().toLowerCase();
  if (k === "didattica") return "didattica";
  if (k === "congresso") return "congresso";
  if (k === "desiderata") return "desiderata";
  if (k === "ferie") return "ferie";
  return "altro";
}

function buildShortMessage(
  activityKind: PlanningAssistentialConflict["activityKind"],
  fromLeaveRange: boolean,
  blockPeriod: AssistentialDayPeriod | null,
): string {
  if (fromLeaveRange) {
    if (activityKind === "ferie") return "Conflitto: ferie tutto il giorno";
    if (activityKind === "desiderata") return "Conflitto: desiderata (giorno intero)";
    return `Conflitto: ${activityKindLabelItalian(activityKind)} (giorno intero)`;
  }
  const fascia = blockPeriod ? activityPeriodLabelForBlock(blockPeriod) : "—";
  if (activityKind === "didattica") return `Conflitto: lezione nel ${fascia}`;
  if (activityKind === "congresso") return `Conflitto: congresso (${fascia})`;
  if (activityKind === "desiderata") return `Conflitto: desiderata (${fascia})`;
  return `Conflitto: ${activityKindLabelItalian(activityKind)} (${fascia})`;
}

function activityLabelFromLeave(leave: PlanningLeaveRangeInput, kind: PlanningAssistentialConflict["activityKind"]): string {
  const n = leave.note?.trim();
  if (n) return n;
  return activityKindLabelItalian(kind);
}

function activityLabelFromBlock(block: PlanningBlockInput, kind: PlanningAssistentialConflict["activityKind"]): string {
  const t = block.title?.trim();
  if (t) return t;
  const n = block.note?.trim();
  if (n) return n;
  return activityKindLabelItalian(kind);
}

export function buildPlanningAssistentialConflicts(params: {
  items: ShiftItemRow[];
  leaves: PlanningLeaveRangeInput[];
  blocks: PlanningBlockInput[];
  nameById: (userId: string) => string;
}): PlanningAssistentialConflict[] {
  const { items, leaves, blocks, nameById } = params;
  const out: PlanningAssistentialConflict[] = [];

  for (const item of items) {
    if (!item.assigned_to) continue;
    if (item.kind === "reperibilita") continue;
    const shiftPeriod = shiftItemAssistentialDayPeriod(item);
    if (shiftPeriod == null) continue;

    const assigneeId = item.assigned_to;
    const assigneeName = nameById(assigneeId);
    const shiftDate = item.shift_date.trim().slice(0, 10);
    const shiftKindLabel = shiftItemKindLabelItalian(item.kind);
    const shiftPeriodLabel = shiftItemPeriodLabelItalian(item.period);
    const locationLabel = locationLabelForShift(item);

    for (const leave of leaves) {
      if (!isLeaveStatusConflicting(leave.status)) continue;
      if (leave.userId !== assigneeId) continue;
      if (!shiftDateInInclusiveLeaveRange(shiftDate, leave.startDate, leave.endDate)) continue;
      const ak = normalizeLeaveRequestType(leave.requestType);
      out.push({
        shiftItemId: item.id,
        shiftDate,
        assigneeId,
        assigneeName,
        shiftKindLabel,
        shiftPeriodLabel,
        locationLabel,
        activityKind: ak === "altro" ? "altro" : ak,
        activityLabel: activityLabelFromLeave(leave, ak === "altro" ? "altro" : ak),
        activityPeriodLabel: "tutto il giorno",
        shortMessage: buildShortMessage(ak === "altro" ? "altro" : ak, true, null),
      });
    }

    for (const block of blocks) {
      if (block.userId !== assigneeId) continue;
      if (String(block.blockDate).trim().slice(0, 10) !== shiftDate) continue;
      if (!dayPeriodsOverlap(shiftPeriod, block.period)) continue;
      const ak = normalizeBlockKind(block.kind);
      out.push({
        shiftItemId: item.id,
        shiftDate,
        assigneeId,
        assigneeName,
        shiftKindLabel,
        shiftPeriodLabel,
        locationLabel,
        activityKind: ak,
        activityLabel: activityLabelFromBlock(block, ak),
        activityPeriodLabel: activityPeriodLabelForBlock(block.period),
        shortMessage: buildShortMessage(ak, false, block.period),
      });
    }
  }

  return out.sort(
    (a, b) =>
      a.shiftDate.localeCompare(b.shiftDate) ||
      a.assigneeName.localeCompare(b.assigneeName, "it") ||
      a.shiftItemId.localeCompare(b.shiftItemId),
  );
}

export function conflictsByShiftItemId(rows: PlanningAssistentialConflict[]): Map<string, PlanningAssistentialConflict[]> {
  const m = new Map<string, PlanningAssistentialConflict[]>();
  for (const r of rows) {
    const prev = m.get(r.shiftItemId) ?? [];
    prev.push(r);
    m.set(r.shiftItemId, prev);
  }
  return m;
}
