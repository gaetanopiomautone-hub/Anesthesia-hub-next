export type MonthContext = {
  yearMonth: string;
  start: Date;
  end: Date;
  isValid: boolean;
};

function isValidYearMonth(v?: string): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

function toYearMonth(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getMonthContext(monthParam?: string): MonthContext {
  const now = new Date();

  if (!isValidYearMonth(monthParam)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      yearMonth: toYearMonth(now),
      start,
      end,
      isValid: false,
    };
  }

  const [y, m] = monthParam.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);

  return {
    yearMonth: monthParam,
    start,
    end,
    isValid: true,
  };
}
