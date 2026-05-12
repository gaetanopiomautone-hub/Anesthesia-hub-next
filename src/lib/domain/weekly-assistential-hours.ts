/**
 * Ore assistenziali settimanali (lun–dom) per limite 36h / specializzando.
 * Riutilizzabile da dashboard e (futuro) PDF.
 *
 * Limite noto: se il planning passa solo i `shift_items` del mese corrente, le settimane
 * a cavallo del mese contano solo i turni presenti in `items` (troncamento ai confini del mese).
 */

import { endOfWeek, format, parseISO, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";

import { shiftItemKindLabelItalian, shiftItemPeriodLabelItalian } from "@/lib/domain/monthly-shifts";
import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

export const ASSISTENTIAL_HALF_DAY_HOURS = 6;
export const WEEKLY_ASSISTENTIAL_CAP_HOURS = 36;

/** ISO week: lunedì = inizio, domenica = fine (date-fns `weekStartsOn: 1`). */
export function weekRangeMondaySunday(shiftDateYmd: string): { weekStart: string; weekEnd: string } {
  const d = parseISO(shiftDateYmd.trim().slice(0, 10));
  const ws = startOfWeek(d, { weekStartsOn: 1 });
  const we = endOfWeek(d, { weekStartsOn: 1 });
  return { weekStart: format(ws, "yyyy-MM-dd"), weekEnd: format(we, "yyyy-MM-dd") };
}

/** Etichetta leggibile “11 mag – 17 mag 2026” (settimana lun–dom). */
export function formatWeekRangeItalian(weekStart: string, weekEnd: string): string {
  const a = parseISO(weekStart);
  const b = parseISO(weekEnd);
  return `${format(a, "d MMM", { locale: it })} – ${format(b, "d MMM yyyy", { locale: it })}`;
}

/**
 * Mezze giornate assistenziali (×6h) per una riga. Reper = 0.
 * - Sala mattina/pomeriggio: 1 ciascuna; sala giornata: 2.
 * - Ambulatorio giornata (import): 2; mattina/pomeriggio: 1.
 */
export function assistentialHalfDayUnits(item: ShiftItemRow): number {
  if (item.kind === "reperibilita") return 0;
  if (item.kind === "sala") {
    if (item.period === "mattina" || item.period === "pomeriggio") return 1;
    if (item.period === "giornata") return 2;
    return 0;
  }
  if (item.kind === "ambulatorio") {
    if (item.period === "giornata") return 2;
    if (item.period === "mattina" || item.period === "pomeriggio") return 1;
    return 1;
  }
  return 0;
}

export type WeeklyAssistentialContributingShift = {
  id: string;
  shift_date: string;
  summary: string;
};

export type WeeklyAssistentialLoadRow = {
  userId: string;
  displayName: string;
  weekStart: string;
  weekEnd: string;
  assistentialHalfDays: number;
  assistentialHours: number;
  reperCount: number;
  exceeded: boolean;
  contributingShifts: WeeklyAssistentialContributingShift[];
};

function contributingSummary(item: ShiftItemRow): string {
  const loc = item.assignment_location?.name ?? item.room_name ?? item.label;
  const dateShort = item.shift_date.trim().slice(0, 10);
  return `${dateShort} · ${shiftItemKindLabelItalian(item.kind)} · ${shiftItemPeriodLabelItalian(item.period)} · ${loc}`;
}

type Agg = {
  displayName: string;
  assistentialHalfDays: number;
  reperCount: number;
  contributing: WeeklyAssistentialContributingShift[];
};

/**
 * Per ogni coppia (specializzando, settimana ISO nel calendario delle date viste), somma ore assistenziali e reper.
 */
export function buildWeeklyAssistentialLoads(
  items: ShiftItemRow[],
  nameById: (id: string) => string,
): WeeklyAssistentialLoadRow[] {
  const byKey = new Map<string, Agg>();

  for (const item of items) {
    if (!item.assigned_to) continue;
    const uid = item.assigned_to;
    const { weekStart, weekEnd } = weekRangeMondaySunday(item.shift_date);
    const key = `${uid}|${weekStart}`;

    const units = assistentialHalfDayUnits(item);
    const isReper = item.kind === "reperibilita";

    if (!byKey.has(key)) {
      byKey.set(key, {
        displayName: nameById(uid),
        assistentialHalfDays: 0,
        reperCount: 0,
        contributing: [],
      });
    }
    const agg = byKey.get(key)!;
    agg.displayName = nameById(uid);

    if (isReper) {
      agg.reperCount += 1;
    } else {
      agg.assistentialHalfDays += units;
      if (units > 0) {
        agg.contributing.push({
          id: item.id,
          shift_date: item.shift_date.trim().slice(0, 10),
          summary: contributingSummary(item),
        });
      }
    }
  }

  const rows: WeeklyAssistentialLoadRow[] = [];
  for (const [key, agg] of byKey) {
    const userId = key.split("|")[0]!;
    const weekStart = key.split("|")[1]!;
    const { weekEnd } = weekRangeMondaySunday(weekStart);
    const hours = agg.assistentialHalfDays * ASSISTENTIAL_HALF_DAY_HOURS;
    const contributing = [...agg.contributing].sort(
      (a, b) => a.shift_date.localeCompare(b.shift_date) || a.id.localeCompare(b.id),
    );
    rows.push({
      userId,
      displayName: agg.displayName,
      weekStart,
      weekEnd,
      assistentialHalfDays: agg.assistentialHalfDays,
      assistentialHours: hours,
      reperCount: agg.reperCount,
      exceeded: hours > WEEKLY_ASSISTENTIAL_CAP_HOURS,
      contributingShifts: contributing,
    });
  }

  return rows.sort(
    (a, b) =>
      a.weekStart.localeCompare(b.weekStart) ||
      a.displayName.localeCompare(b.displayName, "it") ||
      a.userId.localeCompare(b.userId),
  );
}

/** Set di `userId` che superano almeno una settimana (sui dati passati). */
export function userIdsWithAnyWeeklyAssistentialExcess(loads: WeeklyAssistentialLoadRow[]): Set<string> {
  const s = new Set<string>();
  for (const r of loads) {
    if (r.exceeded) s.add(r.userId);
  }
  return s;
}
