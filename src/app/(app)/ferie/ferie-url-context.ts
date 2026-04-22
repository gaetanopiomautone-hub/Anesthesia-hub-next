import { normalizeDayInMonth } from "../../../lib/dates/day-in-month";

const FERIE_PATH = "/ferie";
const MONTH_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type FerieContext = {
  month: string | null;
  day: string | null;
};

type FeriePathContext = {
  month: string | null;
  day?: string | null;
  ok?: "created" | "updated" | "approved" | "rejected" | "cancelled";
  error?: string;
  errorCode?: string;
};

export function parseFerieContextFromForm(formData: FormData): FerieContext {
  const monthRaw = formData.get("month");
  const month =
    typeof monthRaw === "string" && MONTH_PARAM_RE.test(monthRaw.trim()) ? monthRaw.trim() : null;

  if (!month) return { month: null, day: null };

  const dayRaw = formData.get("day");
  const day = typeof dayRaw === "string" ? normalizeDayInMonth(dayRaw.trim(), month) : null;

  return { month, day };
}

export function feriePathWithContext(context: FeriePathContext) {
  const queryParams = new URLSearchParams();
  if (context.month) {
    queryParams.set("month", context.month);
    const normalizedDay = context.day ? normalizeDayInMonth(context.day, context.month) : null;
    if (normalizedDay) queryParams.set("day", normalizedDay);
  }
  if (context.ok) queryParams.set("ok", context.ok);
  if (context.error) queryParams.set("error", context.error);
  if (context.errorCode) queryParams.set("errorCode", context.errorCode);
  const query = queryParams.toString();
  return query ? `${FERIE_PATH}?${query}` : FERIE_PATH;
}
