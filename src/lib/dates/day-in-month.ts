const DAY_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function normalizeDayInMonth(dayParam: string | undefined, yearMonth: string): string | null {
  if (!dayParam) return null;
  const day = dayParam.trim();
  if (!DAY_PARAM_RE.test(day)) return null;
  return day.startsWith(`${yearMonth}-`) ? day : null;
}
