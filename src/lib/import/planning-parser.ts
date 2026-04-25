/**
 * Parser Excel + generazione righe per turnistica mensile.
 * Non assegna utenti: solo struttura turni (sale, ambulatorio, reperibilità).
 */

import { eachDayOfInterval, endOfMonth, format, getISODay, isWeekend, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import * as XLSX from "xlsx";

import {
  findDatesInMonthCompletelyEmpty,
  findDuplicateSalaSlotKeys,
  findWeekdayDatesWithoutSalaInMonth,
} from "@/lib/domain/shift-rules";
import type { ShiftItemKind, ShiftItemPeriod, ShiftItemSource } from "@/lib/domain/monthly-shifts";

const TIME_MATTINA_START = "08:00:00";
const TIME_MATTINA_END = "14:00:00";
const TIME_POMERIGGIO_START = "14:00:00";
const TIME_POMERIGGIO_END = "20:00:00";
const TIME_GIORNATA_START = "08:00:00";
const TIME_GIORNATA_END = "20:00:00";

export type ShiftItemDraft = {
  shift_date: string;
  kind: ShiftItemKind;
  period: ShiftItemPeriod;
  start_time: string | null;
  end_time: string | null;
  label: string;
  room_name: string | null;
  specialty: string | null;
  source: ShiftItemSource;
};

/** Riga uscita da Excel (reparti esclusi già filtrati). */
export const EXCLUDED_SPECIALTIES = [
  "oculistica",
  "oculistic",
  "cardiochirurgia pediatrica",
  "cardiochirurgia", // dopo pediatrica per non spezzare il check più specifico
] as const;

function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function isExcludedSpecialty(specialty: string | null | undefined): boolean {
  if (!specialty) return false;
  const t = normalizeText(specialty);
  if (t.includes("oculist")) return true;
  if (t.includes("cardiochirurgia") && t.includes("pediatric")) return true;
  if (t.includes("cardiochirurgia")) return true;
  return false;
}

const DATA_KEYS = ["data", "giorno", "date", "data turno", "giornata", "giorno turno"];
const ROOM_KEYS = ["sala", "sala operatoria", "stanza", "sala op", "blocco sala"];
const SPEC_KEYS = ["reparto", "branca", "disciplina", "specialita", "specialty", "area", "struttura"];
const PERIOD_KEYS = ["fascia", "turno", "periodo", "fascia oraria", "fasciaoraria"];

function normalizeObjectKeys(row: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k == null) continue;
    const nk = normalizeText(String(k));
    if (v === null || v === undefined) out[nk] = "";
    else if (v instanceof Date) out[nk] = format(v, "yyyy-MM-dd");
    else out[nk] = String(v).trim();
  }
  return out;
}

function pickValue(norm: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const k = normalizeText(c);
    if (norm[k] !== undefined && norm[k] !== "") return norm[k];
  }
  for (const key of Object.keys(norm)) {
    for (const c of candidates) {
      if (key.includes(normalizeText(c)) && norm[key]) return norm[key];
    }
  }
  return "";
}

function parseToYmd(value: string, _year: number, _month: number): string | null {
  const t = value.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    return t.slice(0, 10);
  }
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    let day: number;
    let mon: number;
    if (a > 12) {
      day = a;
      mon = b;
    } else if (b > 12) {
      day = a;
      mon = b;
    } else {
      day = a;
      mon = b;
    }
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return format(new Date(y, mon - 1, day), "yyyy-MM-dd");
  }
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    return format(d, "yyyy-MM-dd");
  }
  return null;
}

function ymdInMonth(ymd: string, year: number, month: number) {
  const p = ymd.split("-");
  if (p.length < 2) return false;
  return Number(p[0]) === year && Number(p[1]) === month;
}

type PeriodToken = "mattina" | "pomeriggio" | "unknown";

function mapPeriodToken(raw: string | undefined): PeriodToken {
  if (!raw) return "unknown";
  const t = normalizeText(raw);
  if (t === "m" || t === "mattina" || t.includes("mattin")) return "mattina";
  if (t === "p" || t === "pomeriggio" || t.includes("pomer")) return "pomeriggio";
  return "unknown";
}

/**
 * Estrae righe sala da un foglio Excel: colonne flessibili (data, sala, reparto, [fascia]).
 * Ogni riga con data+sala valida e reparto non escluso genera 1 o 2 slot (mattina/pomeriggio) a seconda della colonna fascia.
 */
export function parseSalaItemsFromExcelBuffer(
  buffer: ArrayBuffer,
  year: number,
  month: number,
): { items: ShiftItemDraft[]; skippedRows: number; parsedRows: number } {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const name = workbook.SheetNames[0];
  if (!name) {
    return { items: [], skippedRows: 0, parsedRows: 0 };
  }
  const sheet = workbook.Sheets[name];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });

  const items: ShiftItemDraft[] = [];
  const seen = new Set<string>();
  let skippedRows = 0;
  let parsedRows = 0;

  for (const raw of jsonRows) {
    if (!raw || typeof raw !== "object") {
      skippedRows += 1;
      continue;
    }
    const norm = normalizeObjectKeys(raw as Record<string, unknown>);

    const dataRaw = pickValue(norm, DATA_KEYS);
    const room = pickValue(norm, ROOM_KEYS) || "Sala";
    const spec = pickValue(norm, SPEC_KEYS) || null;
    const periodRaw = pickValue(norm, PERIOD_KEYS) || undefined;

    if (isExcludedSpecialty(spec)) {
      skippedRows += 1;
      continue;
    }

    const ymd = parseToYmd(dataRaw, year, month);
    if (!ymd || !ymdInMonth(ymd, year, month)) {
      skippedRows += 1;
      continue;
    }

    const pTok = mapPeriodToken(periodRaw);
    const slotDefs: { period: ShiftItemPeriod; start: string; end: string; label: string }[] = [];

    if (pTok === "mattina") {
      slotDefs.push({ period: "mattina", start: TIME_MATTINA_START, end: TIME_MATTINA_END, label: `Sala · Mattina` });
    } else if (pTok === "pomeriggio") {
      slotDefs.push({
        period: "pomeriggio",
        start: TIME_POMERIGGIO_START,
        end: TIME_POMERIGGIO_END,
        label: `Sala · Pomeriggio`,
      });
    } else {
      slotDefs.push(
        { period: "mattina", start: TIME_MATTINA_START, end: TIME_MATTINA_END, label: "Sala · Mattina" },
        { period: "pomeriggio", start: TIME_POMERIGGIO_START, end: TIME_POMERIGGIO_END, label: "Sala · Pomeriggio" },
      );
    }

    for (const s of slotDefs) {
      const key = `${ymd}|sala|${s.period}|${room}|${spec ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        shift_date: ymd,
        kind: "sala",
        period: s.period,
        start_time: s.start,
        end_time: s.end,
        label: s.label,
        room_name: room,
        specialty: spec,
        source: "excel",
      });
    }
    parsedRows += 1;
  }

  return { items, skippedRows, parsedRows };
}

/** Esegue l’import completo in memoria: sale da Excel + ambulatorio (lun–ven) + reperibilità. */
export function buildAllShiftItemsForImport(
  year: number,
  month: number,
  fileBuffer: ArrayBuffer,
  options?: { extraHolidayYmds?: string[] },
): {
  sala: { items: ShiftItemDraft[]; skippedRows: number; parsedRows: number };
  ambulatorio: ShiftItemDraft[];
  onCallItems: ShiftItemDraft[];
  all: ShiftItemDraft[];
} {
  const sala = parseSalaItemsFromExcelBuffer(fileBuffer, year, month);
  const ambulatorio = buildAmbulatorioItemsForMonth(year, month);
  const onCallItems = buildReperibilitaItemsForMonth(year, month, options);
  return {
    sala,
    ambulatorio,
    onCallItems,
    all: [...sala.items, ...ambulatorio, ...onCallItems],
  };
}

/** Un ambulatorio per ogni lunedì–venerdì del mese. */
export function buildAmbulatorioItemsForMonth(year: number, month: number): ShiftItemDraft[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  const out: ShiftItemDraft[] = [];
  const seen = new Set<string>();

  for (const d of eachDayOfInterval({ start, end })) {
    if (isWeekend(d)) continue;
    const ymd = format(d, "yyyy-MM-dd");
    const key = ymd;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      shift_date: ymd,
      kind: "ambulatorio",
      period: "giornata",
      start_time: TIME_GIORNATA_START,
      end_time: TIME_GIORNATA_END,
      label: "Ambulatorio",
      room_name: null,
      specialty: null,
      source: "generated",
    });
  }
  return out;
}

/** Reperibilità sabato e domenica; opzionale elenco YYYY-MM-DD per festivi extra. */
export function buildReperibilitaItemsForMonth(
  year: number,
  month: number,
  options?: { extraHolidayYmds?: string[] },
): ShiftItemDraft[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  const out: ShiftItemDraft[] = [];
  const seen = new Set<string>();
  const extras = new Set((options?.extraHolidayYmds ?? []).map((s) => s.trim().slice(0, 10)));

  for (const d of eachDayOfInterval({ start, end })) {
    const ymd = format(d, "yyyy-MM-dd");
    const w = getISODay(d);
    const isSatSun = w === 6 || w === 7;
    if (!isSatSun && !extras.has(ymd)) continue;
    if (seen.has(ymd)) continue;
    seen.add(ymd);
    out.push({
      shift_date: ymd,
      kind: "reperibilita",
      period: "reperibilita",
      start_time: TIME_GIORNATA_START,
      end_time: TIME_GIORNATA_END,
      label: "Reperibilità",
      room_name: null,
      specialty: null,
      source: "generated",
    });
  }
  return out;
}

function periodToItalian(period: ShiftItemPeriod): string {
  switch (period) {
    case "mattina":
      return "Mattina";
    case "pomeriggio":
      return "Pomeriggio";
    case "giornata":
      return "Giornata";
    case "reperibilita":
      return "Reperibilità";
    default: {
      const _x: never = period;
      return _x;
    }
  }
}

function formatYmdToDisplay(ymd: string): string {
  const p = ymd.split("-");
  if (p.length < 3) return ymd;
  return `${p[2]}/${p[1]}`;
}

/** Riga unica per anteprima (stile “13/05 Mattina – Chirurgia”). */
export function formatPreviewLine(d: ShiftItemDraft): string {
  const dmy = formatYmdToDisplay(d.shift_date);
  if (d.kind === "sala") {
    const head = periodToItalian(d.period);
    const spec = d.specialty?.trim() || d.room_name?.trim() || d.label;
    return `${dmy} ${head} – ${spec}`;
  }
  if (d.kind === "ambulatorio") {
    return `${dmy} Ambulatorio`;
  }
  return `${dmy} Reperibilità`;
}

export type PlanningFilePreview =
  | {
      ok: true;
      year: number;
      month: number;
      monthLabel: string;
      /** Slot sala (mattina/pomeriggio) importati da Excel. */
      saleCount: number;
      /** Righe file ignorate (data fuori mese, reparto escluso, …). */
      excludedCount: number;
      ambulatorioCount: number;
      onCallCount: number;
      totalItems: number;
      sampleRows: string[];
      /** Giorni feriali del mese senza alcun turno in sala (dopo import). */
      weekdayDatesWithoutSala: string[];
      /** Slot sala potenzialmente duplicati (stessa data, fascia, sala). */
      duplicateSalaKeys: string[];
      /** Giorni del mese senza alcuna voce (né sala, né amb., né reper.). */
      datesCompletelyEmptyInMonth: string[];
    }
  | { ok: false; error: string };

/**
 * Anteprima import: nessun accesso al DB. Usa `buildAllShiftItemsForImport` + conteggi.
 */
export function parsePlanningFile(
  fileBuffer: ArrayBuffer,
  year: number,
  month: number,
  options?: { extraHolidayYmds?: string[] },
): PlanningFilePreview {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: "Anno non valido" };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, error: "Mese non valido" };
  }

  try {
    const { sala, ambulatorio, onCallItems, all } = buildAllShiftItemsForImport(year, month, fileBuffer, options);
    const sorted = [...all].sort(
      (a, b) =>
        a.shift_date.localeCompare(b.shift_date) ||
        String(a.kind).localeCompare(String(b.kind)) ||
        a.period.localeCompare(b.period),
    );
    const sample = sorted.slice(0, 10).map(formatPreviewLine);
    const monthStart = new Date(year, month - 1, 1);
    const monthLabel = format(monthStart, "LLLL yyyy", { locale: it });
    const weekdayDatesWithoutSala = findWeekdayDatesWithoutSalaInMonth(year, month, sala.items);
    const duplicateSalaKeys = findDuplicateSalaSlotKeys(sala.items);
    const datesCompletelyEmptyInMonth = findDatesInMonthCompletelyEmpty(year, month, all);
    return {
      ok: true,
      year,
      month,
      monthLabel: monthLabel.replace(/^\w/u, (c) => c.toLocaleUpperCase("it")),
      saleCount: sala.items.length,
      excludedCount: sala.skippedRows,
      ambulatorioCount: ambulatorio.length,
      onCallCount: onCallItems.length,
      totalItems: all.length,
      sampleRows: sample,
      weekdayDatesWithoutSala,
      duplicateSalaKeys,
      datesCompletelyEmptyInMonth,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore di lettura del file";
    return { ok: false, error: msg };
  }
}
