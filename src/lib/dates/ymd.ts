const YMD_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type PlainYmd = {
  year: number;
  month: number;
  day: number;
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function assertValidYmdParts(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error(`Invalid YMD year: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid YMD month: ${month}`);
  }
  const maxDay = daysInMonth(year, month);
  if (!Number.isInteger(day) || day < 1 || day > maxDay) {
    throw new Error(`Invalid YMD day: ${day} for ${year}-${month}`);
  }
}

/** Parse `yyyy-MM-dd` in modo timezone-safe (solo calendario, niente UTC shift). */
export function parseYmd(value: string): PlainYmd {
  const trimmed = value.trim();
  const match = YMD_RE.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid YMD string: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  assertValidYmdParts(year, month, day);
  return { year, month, day };
}

export function formatYmd(date: Date | PlainYmd): string {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid Date passed to formatYmd");
    }
    return formatYmd({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    });
  }
  assertValidYmdParts(date.year, date.month, date.day);
  const m = String(date.month).padStart(2, "0");
  const d = String(date.day).padStart(2, "0");
  return `${date.year}-${m}-${d}`;
}

/** `yyyy-MM` da `Date` locale o da stringa `yyyy-MM-dd`. */
export function getMonthParam(date: Date | string): string {
  if (typeof date === "string") {
    return formatYmd(parseYmd(date)).slice(0, 7);
  }
  return formatYmd(date).slice(0, 7);
}

export function isYmdInMonth(date: string, month: string): boolean {
  if (!YEAR_MONTH_RE.test(month)) return false;
  try {
    return getMonthParam(date) === month;
  } catch {
    return false;
  }
}

/** Confronto lessicografico ISO date-only (`-1` | `0` | `1`). */
export function compareYmd(a: string, b: string): number {
  const aNorm = formatYmd(parseYmd(a));
  const bNorm = formatYmd(parseYmd(b));
  if (aNorm < bNorm) return -1;
  if (aNorm > bNorm) return 1;
  return 0;
}

export function addDaysYmd(date: string, days: number): string {
  const local = toLocalDateFromYmd(date);
  local.setDate(local.getDate() + days);
  return formatYmd(local);
}

/** Mezzogiorno locale: evita edge DST quando si usa con date-fns/display. */
export function toLocalDateFromYmd(date: string): Date {
  const { year, month, day } = parseYmd(date);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function isValidYearMonth(value: string | undefined): value is string {
  return Boolean(value && YEAR_MONTH_RE.test(value));
}

export function monthStartYmd(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) {
    throw new Error(`Invalid year-month: ${yearMonth}`);
  }
  return `${yearMonth}-01`;
}

export function monthEndYmd(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) {
    throw new Error(`Invalid year-month: ${yearMonth}`);
  }
  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  return formatYmd(new Date(year, month, 0, 12, 0, 0, 0));
}
