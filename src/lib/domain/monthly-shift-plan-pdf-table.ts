/**
 * Righe tabellari per il PDF mensile turni (planning operativo).
 * Puro dominio: nessuna dipendenza da PDF engine.
 */

import { eachDayOfInterval, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

export type MonthlyShiftPlanPdfDayRow = {
  dateStr: string;
  /** Etichetta giorno es. "lun 5 maggio" */
  dayLabel: string;
  mattinaLines: string[];
  pomeriggioLines: string[];
  reperLines: string[];
};

function locationPart(item: ShiftItemRow): string {
  return (
    item.assignment_location?.name?.trim() ||
    item.room_name?.trim() ||
    item.label?.trim() ||
    "—"
  );
}

function displayNameForAssignee(
  assignedTo: string | null,
  nameById: (userId: string) => string,
): string {
  if (!assignedTo) return "—";
  const n = nameById(assignedTo).trim();
  return n.length > 0 ? n : "—";
}

function lineForAssistential(item: ShiftItemRow, nameById: (userId: string) => string): string {
  const loc = locationPart(item);
  const name = displayNameForAssignee(item.assigned_to, nameById);
  if (item.period === "giornata") {
    return `Giornata · ${loc} — ${name}`;
  }
  return `${loc} — ${name}`;
}

function lineForReper(item: ShiftItemRow, nameById: (userId: string) => string, phoneById: (userId: string) => string): string {
  const name = displayNameForAssignee(item.assigned_to, nameById);
  if (!item.assigned_to) {
    return `${name} — n/d`;
  }
  const phone = phoneById(item.assigned_to).trim();
  return `${name} — ${phone.length > 0 ? phone : "n/d"}`;
}

function sortItemsForPdf(a: ShiftItemRow, b: ShiftItemRow): number {
  return (
    locationPart(a).localeCompare(locationPart(b), "it") ||
    String(a.assigned_to ?? "").localeCompare(String(b.assigned_to ?? "")) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Costruisce una riga per ogni giorno del mese [monthStart, monthEnd] (inclusive, yyyy-MM-dd).
 */
export function buildMonthlyShiftPlanPdfTableRows(params: {
  items: ShiftItemRow[];
  monthStart: string;
  monthEnd: string;
  nameById: (userId: string) => string;
  phoneById: (userId: string) => string;
}): MonthlyShiftPlanPdfDayRow[] {
  const { items, monthStart, monthEnd, nameById, phoneById } = params;
  const start = parseISO(monthStart.trim().slice(0, 10));
  const end = parseISO(monthEnd.trim().slice(0, 10));

  const byDate = new Map<string, ShiftItemRow[]>();
  for (const item of items) {
    const d = item.shift_date.trim().slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(item);
  }

  const rows: MonthlyShiftPlanPdfDayRow[] = [];
  for (const day of eachDayOfInterval({ start, end })) {
    const dateStr = format(day, "yyyy-MM-dd");
    const dayLabel = format(day, "EEE d MMMM", { locale: it });
    const list = (byDate.get(dateStr) ?? []).slice().sort(sortItemsForPdf);

    const mattinaLines: string[] = [];
    const pomeriggioLines: string[] = [];
    const reperLines: string[] = [];

    for (const item of list) {
      if (item.kind === "reperibilita") {
        reperLines.push(lineForReper(item, nameById, phoneById));
        continue;
      }
      if (item.kind !== "sala" && item.kind !== "ambulatorio") continue;

      if (item.period === "giornata") {
        mattinaLines.push(lineForAssistential(item, nameById));
      } else if (item.period === "mattina") {
        mattinaLines.push(lineForAssistential(item, nameById));
      } else if (item.period === "pomeriggio") {
        pomeriggioLines.push(lineForAssistential(item, nameById));
      } else {
        mattinaLines.push(lineForAssistential(item, nameById));
      }
    }

    rows.push({
      dateStr,
      dayLabel,
      mattinaLines,
      pomeriggioLines,
      reperLines,
    });
  }

  return rows;
}
