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

const ITALIAN_MONTHS: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

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
  if (t.includes("urgenz")) return true;
  if (t.includes("tecnico") && (t.includes("rx") || t.replace(/\s/g, "").includes("rx"))) return true;
  return false;
}

function isEmptyCellish(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[-–—_./\s]+$/u.test(t)) return true;
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

const ITALIAN_HEADER_WITH_DAY = new RegExp(
  `^(luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato|domenica)` +
    `\\s*,\\s*([a-zA-Z\u00C0-\u024F']+)\\s+(\\d{1,2})\\s*,?\\s*(\\d{4})\\s*$`,
  "i",
);

function findItalianMonthId(normalizedMonth: string): number | null {
  for (const [name, m] of Object.entries(ITALIAN_MONTHS)) {
    if (normalizedMonth === name) return m;
  }
  for (const [name, m] of Object.entries(ITALIAN_MONTHS)) {
    if (name.startsWith(normalizedMonth) || normalizedMonth.startsWith(name)) return m;
  }
  return null;
}

/**
 * Riconosce header tipo "lunedì, maggio 04, 2026" o "maggio 4, 2026".
 * Celle con solo Date() native restituisce la data in formato ymd.
 */
function parseYmdFromBlockDayHeader(raw: string, cell: unknown, year: number, month: number): string | null {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const ymd = format(cell, "yyyy-MM-dd");
    if (ymdInMonth(ymd, year, month)) return ymd;
  }
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const ymd = t.slice(0, 10);
    if (ymdInMonth(ymd, year, month)) return ymd;
    return null;
  }
  const m1 = t.match(ITALIAN_HEADER_WITH_DAY);
  if (m1) {
    const monName = normalizeText(m1[2].replace(/'/g, ""));
    const mo = findItalianMonthId(monName);
    if (mo == null) return null;
    const d = Number(m1[3]);
    const y = Number(m1[4]);
    const ymd = ymdOrNullFromParts(y, mo, d);
    if (ymd && ymdInMonth(ymd, year, month)) return ymd;
  }
  const m2 = t.match(
    /^(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{1,2}),?\s*(\d{4})/i,
  );
  if (m2) {
    const monName = normalizeText(m2[1].replace(/'/g, ""));
    const mo = findItalianMonthId(monName);
    if (mo == null) return null;
    const d = Number(m2[2]);
    const y = Number(m2[3]);
    const ymd = ymdOrNullFromParts(y, mo, d);
    if (ymd && ymdInMonth(ymd, year, month)) return ymd;
  }
  const fromGeneric = parseToYmd(t, year, month);
  if (fromGeneric && ymdInMonth(fromGeneric, year, month)) return fromGeneric;
  return null;
}

function ymdOrNullFromParts(y: number, mo: number, d: number): string | null {
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return format(date, "yyyy-MM-dd");
}

function cellToDisplayString(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return String(v);
  }
  if (typeof v === "number") {
    if (v > 30000 && v < 100000) {
      const ms = (v - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) {
        return format(d, "yyyy-MM-dd");
      }
    }
  }
  return String(v).trim();
}

function toRawMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true }) as unknown[][];
  if (!rows.length) {
    return [[]];
  }
  const maxC = Math.max(0, ...rows.map((r) => (Array.isArray(r) ? r.length : 0)));
  const matrix = rows.map((row) => {
    const a = (Array.isArray(row) ? row : []) as unknown[];
    return Array.from({ length: maxC }, (_, c) => a[c] ?? null);
  });
  const merges = (sheet["!merges"] ?? []) as XLSX.Range[];
  for (const merge of merges) {
    const startRow = merge.s.r;
    const endRow = merge.e.r;
    const startCol = merge.s.c;
    const endCol = merge.e.c;
    const topLeft = matrix[startRow]?.[startCol] ?? null;
    if (topLeft == null || topLeft === "") continue;
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if ((matrix[r]?.[c] ?? null) == null || matrix[r]?.[c] === "") {
          matrix[r][c] = topLeft;
        }
      }
    }
  }
  return matrix;
}

function isMattinaTimeLabel(s: string): boolean {
  const t = normalizeText(s);
  if (!s.trim()) return false;
  if (t === "m" || t === "mattina" || t.includes("mattin")) return true;
  if (/^8[.\s,:]*00?\s*[-–]\s*1[4]/.test(s.replace(/\s/g, "")) || t.includes("8-14") || t.includes("8–14")) return true;
  if (t.includes("8") && t.includes("14") && t.includes("-") && t.length < 20) return true;
  return false;
}

function isPomeriggioTimeLabel(s: string): boolean {
  const t = normalizeText(s);
  if (!s.trim()) return false;
  if (t === "p" || t === "pomeriggio" || t.includes("pomer")) return true;
  if (/1[4][.\s,:]*00?\s*[-–]\s*2[0]/.test(s.replace(/\s/g, "")) || t.includes("14-20") || t.includes("14–20")) return true;
  if (t.includes("14") && t.includes("20") && t.includes("-") && t.length < 20) return true;
  return false;
}

function isNoiseTableHeader(s: string): boolean {
  const t = normalizeText(s);
  if (!t) return true;
  if (t.length <= 20 && (t === "reparto" || t === "branca" || t.startsWith("special") || t === "fascia")) {
    return true;
  }
  return false;
}

function isAmbulatorioLike(value: string): boolean {
  const t = normalizeText(value);
  return t.includes("ambulator");
}

function isReperibilitaLike(value: string): boolean {
  const t = normalizeText(value);
  return t.includes("reperibil");
}

function isExplicitNonSalaColumn(header: string): boolean {
  if (!header.trim()) return false;
  if (isExcludedSpecialty(header)) return true;
  if (isAmbulatorioLike(header)) return true;
  if (isReperibilitaLike(header)) return true;
  return false;
}

function pickTimeColumn(m: string[][], t1: number, t2: number, cols: number): number {
  for (let c0 = 0; c0 < cols; c0++) {
    const a = m[t1]?.[c0] ?? "";
    const b = m[t2]?.[c0] ?? "";
    if (isMattinaTimeLabel(a) && isPomeriggioTimeLabel(b)) {
      return c0;
    }
  }
  return -1;
}

/** Colonna (stessa riga) del prossimo header giorno dopo `cAfter`, o `maxCol` se non c’è. */
function findNextDayHeaderColInRow(
  m: string[][],
  raw: unknown[][],
  r: number,
  cAfter: number,
  year: number,
  month: number,
  maxCol: number,
): number {
  for (let c2 = cAfter + 1; c2 < maxCol; c2++) {
    const s = m[r]?.[c2] ?? "";
    const cell = raw[r]?.[c2];
    const ymd = parseYmdFromBlockDayHeader(s, cell, year, month);
    if (ymd) {
      return c2;
    }
  }
  return maxCol;
}

type ParseBlockResult = {
  items: ShiftItemDraft[];
  skipped: number;
  anyDayHeaderInTargetMonth: boolean;
};

type ParseRowBasedResult = {
  items: ShiftItemDraft[];
  skipped: number;
  rowLayoutDetected: boolean;
};

/**
 * Formato a blocchi: riga "lunedì, maggio 04, 2026", sotto riga con intestazioni colonna = specialità,
 * poi righe 8-14 (Mattina) e 14-20 (Pomeriggio) con celle = sala/slot. Colonne escluse (es. oculistica) ignorate.
 */
function parseSalaFromWeekBlockMatrix(
  raw: unknown[][],
  year: number,
  month: number,
): ParseBlockResult {
  const m = raw.map((row) => row.map((c) => cellToDisplayString(c)));
  const rows = m.length;
  const maxCol = m[0]?.length ?? 0;
  const items: ShiftItemDraft[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let anyDayHeaderInTargetMonth = false;

  const pushSala = (
    ymd: string,
    period: ShiftItemPeriod,
    start: string,
    end: string,
    room: string,
    specialty: string,
  ) => {
    const key = `${ymd}|sala|${period}|${room}|${specialty}`;
    if (seen.has(key)) return;
    seen.add(key);
    const label = period === "mattina" ? "Sala · Mattina" : "Sala · Pomeriggio";
    items.push({
      shift_date: ymd,
      kind: "sala",
      period,
      start_time: start,
      end_time: end,
      label,
      room_name: room,
      specialty: specialty || null,
      source: "excel",
    });
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < maxCol; c++) {
      const cell = raw[r]?.[c];
      const s = m[r]?.[c] ?? "";
      const ymd = parseYmdFromBlockDayHeader(s, cell, year, month);
      if (!ymd || !ymdInMonth(ymd, year, month)) {
        continue;
      }
      anyDayHeaderInTargetMonth = true;

      const specR = r + 1;
      const t1 = r + 2;
      const t2r = r + 3;
      if (t2r >= rows) {
        skipped += 1;
        continue;
      }
      const cols = Math.max(maxCol, m[specR]?.length ?? 0, m[t1]?.length ?? 0, m[t2r]?.length ?? 0);
      const cBlockEnd = findNextDayHeaderColInRow(m, raw, r, c, year, month, cols);
      const timeCol = pickTimeColumn(m, t1, t2r, cols);
      if (timeCol < 0) {
        skipped += 1;
        continue;
      }
      for (let j = c; j < cBlockEnd; j++) {
        if (j === timeCol) {
          continue;
        }
        const header = m[specR]?.[j] ?? "";
        const vMattina = m[t1]?.[j] ?? "";
        const vPom = m[t2r]?.[j] ?? "";
        const hasAnySlotValue = !isEmptyCellish(vMattina) || !isEmptyCellish(vPom);
        if (!hasAnySlotValue) {
          continue;
        }
        if (isNoiseTableHeader(header)) {
          continue;
        }
        if (isExplicitNonSalaColumn(header)) {
          continue;
        }
        if (isAmbulatorioLike(vMattina) || isAmbulatorioLike(vPom)) continue;
        if (isReperibilitaLike(vMattina) || isReperibilitaLike(vPom)) continue;
        if (!isEmptyCellish(vMattina) && isExcludedSpecialty(vMattina)) {
          skipped += 1;
          continue;
        }
        if (!isEmptyCellish(vPom) && isExcludedSpecialty(vPom)) {
          skipped += 1;
          continue;
        }
        const spec = isEmptyCellish(header) ? "Sala" : header.trim();
        if (!isEmptyCellish(vMattina)) {
          pushSala(ymd, "mattina", TIME_MATTINA_START, TIME_MATTINA_END, vMattina.trim(), spec);
        }
        if (!isEmptyCellish(vPom)) {
          pushSala(ymd, "pomeriggio", TIME_POMERIGGIO_START, TIME_POMERIGGIO_END, vPom.trim(), spec);
        }
      }
    }
  }
  return { items, skipped, anyDayHeaderInTargetMonth };
}

function parsePeriodFromTimeCell(raw: string): ShiftItemPeriod | null {
  const n = normalizeTimeRange(raw);
  if (n.includes("8-14") || n.includes("08-14") || isMattinaTimeLabel(raw)) return "mattina";
  if (n.includes("14-20") || isPomeriggioTimeLabel(raw)) return "pomeriggio";
  return null;
}

function isSalaRowId(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^\d{1,2}$/.test(t)) return true;
  if (normalizeText(t).startsWith("sala")) return true;
  return false;
}

function normalizeTimeRange(raw: string): string {
  return normalizeText(raw).replace(/[–—−]/g, "-").replace(/\s+/g, "");
}

function weekdayIsoFromText(raw: string): number | null {
  const t = normalizeText(raw);
  if (!t) return null;
  if (t.includes("lun")) return 1;
  if (t.includes("mar")) return 2;
  if (t.includes("mer")) return 3;
  if (t.includes("gio")) return 4;
  if (t.includes("ven")) return 5;
  if (t.includes("sab")) return 6;
  if (t.includes("dom")) return 7;
  return null;
}

function collectWeekdayColumnHints(
  m: string[][],
  maxCol: number,
): { col: number; iso: number; ymdHint: string | null; isTech: boolean }[] {
  const out: { col: number; iso: number; ymdHint: string | null; isTech: boolean }[] = [];
  for (let c = 2; c < maxCol; c++) {
    let iso: number | null = null;
    let ymdHint: string | null = null;
    let isTech = false;
    for (let r = 0; r < Math.min(m.length, 20); r++) {
      const txt = m[r]?.[c] ?? "";
      const n = normalizeText(txt);
      if (!n) continue;
      if (n.includes("tecnico")) {
        isTech = true;
      }
      if (iso == null) {
        iso = weekdayIsoFromText(txt);
      }
      if (!ymdHint) {
        const mDate = txt.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        if (mDate) {
          ymdHint = `${mDate[1]}-${mDate[2]}-${mDate[3]}`;
        }
      }
    }
    if (iso != null) {
      out.push({ col: c, iso, ymdHint, isTech });
    }
  }
  return out;
}

function parseSalaFromRowLayoutMatrix(raw: unknown[][], year: number, month: number): ParseRowBasedResult {
  const m = raw.map((row) => row.map((c) => cellToDisplayString(c)));
  const maxCol = Math.max(0, ...m.map((r) => r.length));
  const items: ShiftItemDraft[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let rowLayoutDetected = false;

  const dayColumns: { col: number; ymd: string }[] = [];
  const weekdayHints = collectWeekdayColumnHints(m, maxCol).filter((h) => !h.isTech);
  const monthDatesByIso: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  for (const d of eachDayOfInterval({ start, end })) {
    monthDatesByIso[getISODay(d)].push(format(d, "yyyy-MM-dd"));
  }

  // 1) prefer explicit ymd parsed from header cells in that column
  for (const h of weekdayHints) {
    let ymd: string | null = null;
    for (let r = 0; r < Math.min(m.length, 20); r++) {
      const txt = m[r]?.[h.col] ?? "";
      const maybe = parseYmdFromBlockDayHeader(txt, raw[r]?.[h.col], year, month);
      if (maybe) {
        ymd = maybe;
        break;
      }
    }
    if (ymd) {
      dayColumns.push({ col: h.col, ymd });
    }
  }

  if (!dayColumns.length) {
    // 2) fallback: solo weekday header (lunedì/martedì/...) mappato in sequenza sul mese.
    for (const h of weekdayHints) {
      const q = monthDatesByIso[h.iso];
      if (!q?.length) continue;
      const ymd = q.shift();
      if (!ymd) continue;
      dayColumns.push({ col: h.col, ymd });
    }
  }

  if (!dayColumns.length) {
    // detection row-based: almeno sala + orario presente, anche se giorni non mappati.
    for (let r = 0; r < m.length; r++) {
      if (isSalaRowId(m[r]?.[0] ?? "") && parsePeriodFromTimeCell(m[r]?.[1] ?? "")) {
        rowLayoutDetected = true;
        break;
      }
    }
    return { items: [], skipped: 0, rowLayoutDetected };
  }

  for (let r = 0; r < m.length; r++) {
    const salaRaw = m[r]?.[0] ?? "";
    const timeRaw = m[r]?.[1] ?? "";
    const period = parsePeriodFromTimeCell(timeRaw);
    if (!isSalaRowId(salaRaw) || !period) continue;
    rowLayoutDetected = true;

    for (const { col, ymd } of dayColumns) {
      const value = (m[r]?.[col] ?? "").trim();
      if (isEmptyCellish(value)) continue;
      if (normalizeText(value).includes("tecnico")) continue;
      if (isExcludedSpecialty(value) || isAmbulatorioLike(value) || isReperibilitaLike(value)) {
        skipped += 1;
        continue;
      }
      const room = normalizeText(salaRaw).startsWith("sala") ? salaRaw.trim() : `Sala ${salaRaw.trim()}`;
      const key = `${ymd}|sala|${period}|${room}|${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        shift_date: ymd,
        kind: "sala",
        period,
        start_time: period === "mattina" ? TIME_MATTINA_START : TIME_POMERIGGIO_START,
        end_time: period === "mattina" ? TIME_MATTINA_END : TIME_POMERIGGIO_END,
        label: period === "mattina" ? "Sala · Mattina" : "Sala · Pomeriggio",
        room_name: room,
        specialty: value,
        source: "excel",
      });
    }
  }

  return { items, skipped, rowLayoutDetected };
}

function parseSalaFromLegacyJsonRows(
  jsonRows: Record<string, unknown>[],
  year: number,
  month: number,
): { items: ShiftItemDraft[]; skippedRows: number; parsedRows: number } {
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

/**
 * Estrae turni in sala: formato a **blocchi** (header giorno italiano, righe 8-14 / 14-20, colonne = specialità).
 * Se in foglio compaiono header giorno nel mese/anno scelti, si usa **solo** quel formato (no ritorno al modello a righe "flat").
 * Altrimenti: compatibilità con vecchio Excel tabellare (data, sala, reparto, fascia).
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
  const matrix = toRawMatrix(sheet);
  const rowBased = parseSalaFromRowLayoutMatrix(matrix, year, month);
  if (rowBased.rowLayoutDetected) {
    return {
      items: rowBased.items,
      skippedRows: rowBased.skipped,
      parsedRows: rowBased.items.length,
    };
  }
  const block = parseSalaFromWeekBlockMatrix(matrix, year, month);

  if (block.anyDayHeaderInTargetMonth) {
    return {
      items: block.items,
      skippedRows: block.skipped,
      parsedRows: block.items.length,
    };
  }

  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false });
  return parseSalaFromLegacyJsonRows(jsonRows, year, month);
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
