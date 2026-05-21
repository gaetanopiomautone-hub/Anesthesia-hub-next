import Link from "next/link";

import { addMonthsToYearMonth, formatYearMonthLabel } from "@/lib/dates/ymd";
import { feriePathForMonth } from "@/app/(app)/ferie/ferie-url-context";

type FerieMonthNavProps = {
  yearMonth: string;
  selectedDay?: string | null;
};

export function FerieMonthNav({ yearMonth, selectedDay = null }: FerieMonthNavProps) {
  const previousMonth = addMonthsToYearMonth(yearMonth, -1);
  const nextMonth = addMonthsToYearMonth(yearMonth, 1);
  const monthLabel = formatYearMonthLabel(yearMonth);

  const prevHref = feriePathForMonth(previousMonth, selectedDay);
  const nextHref = feriePathForMonth(nextMonth, selectedDay);

  return (
    <nav
      aria-label="Navigazione mese calendario ferie"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2"
    >
      <Link
        href={prevHref}
        className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        ← Mese precedente
      </Link>
      <strong className="text-sm font-semibold capitalize text-foreground">{monthLabel}</strong>
      <Link
        href={nextHref}
        className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        Mese successivo →
      </Link>
    </nav>
  );
}
