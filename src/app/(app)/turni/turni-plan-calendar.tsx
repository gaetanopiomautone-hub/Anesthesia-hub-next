"use client";

import { format, isSameMonth } from "date-fns";
import { it } from "date-fns/locale";

import type { MonthlyPlanDaySummary } from "@/lib/domain/monthly-plan-day-summary";
import { buildCalendarWeeksForMonth } from "@/lib/domain/monthly-plan-day-summary";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

function cellStatusClass(status: MonthlyPlanDaySummary["fillStatus"], inMonth: boolean): string {
  if (!inMonth) return "border-transparent bg-transparent opacity-40";
  switch (status) {
    case "complete":
      return "border-emerald-300/80 bg-emerald-50/80 dark:border-emerald-800/50 dark:bg-emerald-950/30";
    case "partial":
      return "border-amber-300/80 bg-amber-50/70 dark:border-amber-800/50 dark:bg-amber-950/25";
    case "conflict":
      return "border-rose-400/80 bg-rose-50/80 dark:border-rose-800/50 dark:bg-rose-950/30";
    case "empty":
    default:
      return "border-border/80 bg-muted/30";
  }
}

export function TurniPlanCalendar({
  monthAnchor,
  daySummaries,
  selectedDate,
  onSelectDate,
}: {
  monthAnchor: Date;
  daySummaries: Map<string, MonthlyPlanDaySummary>;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const weeks = buildCalendarWeeksForMonth(monthAnchor);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {weeks.map((week) => (
          <div key={week[0]?.toISOString() ?? "w"} className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const ymd = format(day, "yyyy-MM-dd");
              const inMonth = isSameMonth(day, monthAnchor);
              const summary = daySummaries.get(ymd);
              const isSelected = selectedDate === ymd;
              const dayNum = format(day, "d");

              if (!inMonth) {
                return (
                  <div
                    key={ymd}
                    className="min-h-[4.5rem] rounded-lg border border-transparent p-1 sm:min-h-[5.5rem]"
                    aria-hidden
                  />
                );
              }

              const hasSlots = (summary?.totalSlots ?? 0) > 0;
              const title = summary
                ? `${format(day, "EEEE d MMMM", { locale: it })} · ${summary.salaAssigned}/${summary.salaTotal} sale · ${summary.assignedCount}/${summary.totalSlots} assegnati`
                : format(day, "EEEE d MMMM", { locale: it });

              return (
                <button
                  key={ymd}
                  type="button"
                  onClick={() => onSelectDate(ymd)}
                  title={title}
                  aria-label={`Apri dettaglio ${format(day, "d MMMM yyyy", { locale: it })}`}
                  aria-pressed={isSelected}
                  className={cn(
                    "flex min-h-[4.5rem] flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-[5.5rem] sm:p-2",
                    "hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    cellStatusClass(summary?.fillStatus ?? "empty", true),
                    isSelected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                  )}
                >
                  <span className="text-xs font-semibold tabular-nums text-foreground sm:text-sm">{dayNum}</span>
                  {hasSlots ? (
                    <span className="mt-0.5 text-[0.6rem] leading-tight text-foreground/90 sm:text-[0.65rem]">
                      <span className="font-medium tabular-nums">
                        {summary!.salaAssigned}/{summary!.salaTotal}
                      </span>{" "}
                      sale
                    </span>
                  ) : (
                    <span className="mt-0.5 text-[0.6rem] text-muted-foreground sm:text-[0.65rem]">—</span>
                  )}
                  {hasSlots ? (
                    <span className="text-[0.55rem] tabular-nums text-muted-foreground sm:text-[0.6rem]">
                      {summary!.assignedCount}/{summary!.totalSlots} slot
                    </span>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-0.5 pt-1">
                    {summary && summary.reperTotal > 0 ? (
                      <span className="rounded bg-violet-100 px-1 py-px text-[0.55rem] font-medium text-violet-950 dark:bg-violet-950/50 dark:text-violet-100">
                        Rep{summary.reperAssigned > 0 ? ` ${summary.reperAssigned}/${summary.reperTotal}` : ""}
                      </span>
                    ) : null}
                    {summary && summary.conflictCount > 0 ? (
                      <span className="rounded bg-rose-200/90 px-1 py-px text-[0.55rem] font-medium text-rose-950 dark:bg-rose-900/50 dark:text-rose-100">
                        {summary.conflictCount} conf.
                      </span>
                    ) : null}
                    {summary?.hasWeeklyCapWarning ? (
                      <span className="rounded bg-amber-200/90 px-1 py-px text-[0.55rem] font-medium text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
                        &gt;36h
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
