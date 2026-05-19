"use client";

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { useMemo, useState } from "react";

import { TurniDayDetailSheet } from "@/app/(app)/turni/turni-day-detail-sheet";
import { TraineeWeekDayDetail } from "@/app/(app)/turni/trainee-week-day-detail";
import type {
  TraineeWeekSummaryDay,
  TraineeWeekSummaryEntry,
  TraineeWeekSummaryEntryCategory,
  TraineeWeeklyPlanningWeek,
} from "@/lib/domain/trainee-weekly-planning-summary";
import { formatWeekRangeItalian, WEEKLY_ASSISTENTIAL_CAP_HOURS } from "@/lib/domain/weekly-assistential-hours";
import { cn } from "@/lib/utils/cn";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

function entryShortLabel(entry: TraineeWeekSummaryEntry): string {
  if (entry.locationLabel) return entry.locationLabel;
  if (entry.category === "reper") return "Reperibilità";
  return entry.label.trim();
}

function hasCategory(
  day: TraineeWeekSummaryDay,
  cats: TraineeWeekSummaryEntryCategory[],
): boolean {
  const all = [...day.morningItems, ...day.afternoonItems, ...day.fullDayItems, ...day.reperItems];
  return all.some((e) => cats.includes(e.category));
}

function DayBadges({ day }: { day: TraineeWeekSummaryDay }) {
  const badges: { key: string; label: string; className: string }[] = [];
  if (day.conflictMessages.length > 0) {
    badges.push({
      key: "conf",
      label: "Conf.",
      className: "bg-rose-200/90 text-rose-950 dark:bg-rose-900/50 dark:text-rose-100",
    });
  }
  if (day.reperItems.length > 0) {
    badges.push({
      key: "rep",
      label: "Rep",
      className: "bg-violet-100 text-violet-950 dark:bg-violet-950/50 dark:text-violet-100",
    });
  }
  if (hasCategory(day, ["didattica"])) {
    badges.push({
      key: "lez",
      label: "Lez.",
      className: "bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100",
    });
  }
  if (hasCategory(day, ["congresso"])) {
    badges.push({
      key: "cong",
      label: "Congr.",
      className: "bg-teal-100 text-teal-950 dark:bg-teal-950/50 dark:text-teal-100",
    });
  }
  if (hasCategory(day, ["ferie", "desiderata_leave"])) {
    badges.push({
      key: "ferie",
      label: "Ferie",
      className: "bg-slate-200/90 text-slate-900 dark:bg-slate-800/60 dark:text-slate-100",
    });
  }
  if (badges.length === 0) return null;
  return (
    <div className="mt-auto flex flex-wrap gap-0.5 pt-1">
      {badges.map((b) => (
        <span key={b.key} className={cn("rounded px-1 py-px text-[0.55rem] font-medium", b.className)}>
          {b.label}
        </span>
      ))}
    </div>
  );
}

function FasciaLine({ label, entries }: { label: string; entries: TraineeWeekSummaryEntry[] }) {
  if (entries.length === 0) {
    return (
      <span className="block truncate text-[0.6rem] text-muted-foreground sm:text-[0.65rem]">
        <span className="font-medium text-muted-foreground/90">{label}:</span> —
      </span>
    );
  }
  const text = entries.map(entryShortLabel).join(", ");
  return (
    <span className="block truncate text-[0.6rem] leading-tight text-foreground/90 sm:text-[0.65rem]" title={text}>
      <span className="font-medium text-muted-foreground">{label}:</span> {text}
    </span>
  );
}

function weekHoursTone(hours: number, exceeded: boolean): string {
  if (exceeded) return "text-rose-700 dark:text-rose-300";
  if (hours >= WEEKLY_ASSISTENTIAL_CAP_HOURS) return "text-amber-800 dark:text-amber-200";
  return "text-foreground";
}

export function TraineeWeekCalendar({
  week,
  highlightWeekStart,
  showWeekHeader = true,
  className,
}: {
  week: TraineeWeeklyPlanningWeek;
  /** Evidenzia questa settimana (es. settimana corrente in dashboard). */
  highlightWeekStart?: string;
  showWeekHeader?: boolean;
  className?: string;
}) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const selectedDayData = useMemo(
    () => week.days.find((d) => d.date === selectedDay) ?? null,
    [week.days, selectedDay],
  );

  const isHighlighted = highlightWeekStart != null && week.weekStart === highlightWeekStart;
  const hoursClass = weekHoursTone(week.totalAssistentialHours, week.exceededWeeklyCap);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/80 bg-card/50 p-2.5 sm:p-3",
        isHighlighted && "ring-1 ring-primary/40",
        className,
      )}
    >
      {showWeekHeader ? (
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2">
          <p className="text-xs font-medium text-foreground sm:text-sm">
            {formatWeekRangeItalian(week.weekStart, week.weekEnd)}
            {week.partialWeekOutOfMonth ? (
              <span className="ml-1.5 text-[0.65rem] font-normal text-muted-foreground">(parziale sul mese)</span>
            ) : null}
          </p>
          <p className={cn("text-xs font-semibold tabular-nums sm:text-sm", hoursClass)}>
            {week.totalAssistentialHours}/{WEEKLY_ASSISTENTIAL_CAP_HOURS}h
          </p>
        </div>
      ) : null}
      {(week.exceededWeeklyCap || week.weekHasConflicts || week.reperCount > 0) && showWeekHeader ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {week.exceededWeeklyCap ? (
            <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[0.65rem] font-medium text-rose-950 dark:bg-rose-950/40 dark:text-rose-50">
              Oltre {WEEKLY_ASSISTENTIAL_CAP_HOURS}h
            </span>
          ) : null}
          {week.weekHasConflicts ? (
            <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[0.65rem] font-medium text-orange-950 dark:bg-orange-950/40 dark:text-orange-50">
              Conflitti
            </span>
          ) : null}
          {week.reperCount > 0 ? (
            <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[0.65rem] font-medium text-violet-950 dark:bg-violet-950/40 dark:text-violet-100">
              {week.reperCount} reper
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground sm:text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="py-0.5">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {week.days.map((day) => {
          const dayNum = format(parseISO(day.date), "d");
          const isSelected = selectedDay === day.date;
          const inMonth = day.isInVisibleMonth;
          return (
            <button
              key={day.date}
              type="button"
              disabled={!inMonth}
              onClick={() => inMonth && setSelectedDay(day.date)}
              title={day.weekdayLabel}
              aria-label={`Dettaglio ${day.weekdayLabel}`}
              aria-pressed={isSelected}
              className={cn(
                "flex min-h-[5rem] flex-col rounded-lg border p-1.5 text-left transition-colors sm:min-h-[5.75rem] sm:p-2",
                !inMonth && "cursor-default border-transparent bg-muted/25 opacity-50",
                inMonth &&
                  "border-border/80 bg-muted/20 hover:border-primary/50 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                inMonth && day.conflictMessages.length > 0 && "border-rose-300/80 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/20",
                isSelected && inMonth && "ring-2 ring-primary ring-offset-1 ring-offset-background",
              )}
            >
              <span className="text-xs font-semibold tabular-nums">{dayNum}</span>
              {inMonth ? (
                <>
                  <FasciaLine label="M" entries={day.morningItems} />
                  <FasciaLine label="P" entries={day.afternoonItems} />
                  {day.reperItems.length > 0 ? (
                    <span className="text-[0.55rem] font-medium text-violet-900 dark:text-violet-200">Rep</span>
                  ) : null}
                  <span className="mt-0.5 text-[0.55rem] tabular-nums text-muted-foreground">
                    {day.assistentialDayHours}h
                  </span>
                  <DayBadges day={day} />
                </>
              ) : (
                <span className="mt-1 text-[0.6rem] text-muted-foreground">—</span>
              )}
            </button>
          );
        })}
      </div>

      <TurniDayDetailSheet
        date={selectedDay}
        open={selectedDay != null && selectedDayData != null}
        onOpenChange={(open) => {
          if (!open) setSelectedDay(null);
        }}
      >
        {selectedDayData ? <TraineeWeekDayDetail day={selectedDayData} /> : null}
      </TurniDayDetailSheet>
    </div>
  );
}
