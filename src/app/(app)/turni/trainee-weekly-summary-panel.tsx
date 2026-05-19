"use client";

import { format, startOfWeek } from "date-fns";
import { useMemo, useState } from "react";

import { TraineeWeekCalendar } from "@/app/(app)/turni/trainee-week-calendar";
import { Button } from "@/components/ui/button";
import type {
  TraineeWeeklyPlanningSummaryRow,
  TraineeWeeklyPlanningWeek,
} from "@/lib/domain/trainee-weekly-planning-summary";
import { traineePlanningWeekHasContent } from "@/lib/domain/trainee-weekly-planning-summary";
import { formatWeekRangeItalian, weekRangeMondaySunday } from "@/lib/domain/weekly-assistential-hours";
import { cn } from "@/lib/utils/cn";

type TraineeWeeklySummaryPanelProps = {
  summaries: TraineeWeeklyPlanningSummaryRow[];
  monthStartStr: string;
  monthEndStr: string;
  viewerRole: "specializzando" | "tutor" | "admin";
  viewerUserId: string;
};

function currentWeekStartMonday(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function sortWeeks(weeks: TraineeWeeklyPlanningWeek[], currentWeekStart: string): TraineeWeeklyPlanningWeek[] {
  return [...weeks].sort((a, b) => {
    if (a.weekStart === currentWeekStart) return -1;
    if (b.weekStart === currentWeekStart) return 1;
    return a.weekStart.localeCompare(b.weekStart);
  });
}

function weeksForView(
  weeks: TraineeWeeklyPlanningWeek[],
  showAllWeeks: boolean,
  currentWeekStart: string,
): TraineeWeeklyPlanningWeek[] {
  const sorted = sortWeeks(weeks, currentWeekStart);
  if (showAllWeeks) return sorted;
  return sorted.filter((w) => w.weekStart === currentWeekStart);
}

export function TraineeWeeklySummaryPanel({
  summaries,
  monthStartStr,
  monthEndStr,
  viewerRole,
  viewerUserId,
}: TraineeWeeklySummaryPanelProps) {
  const isTraineeView = viewerRole === "specializzando";
  const canExpandToFullMonth = viewerRole === "admin" || viewerRole === "tutor";
  const [showAllWeeks, setShowAllWeeks] = useState(false);
  const currentWeekStart = currentWeekStartMonday();
  const todayYmd = format(new Date(), "yyyy-MM-dd");
  const todayInViewedMonth = todayYmd >= monthStartStr && todayYmd <= monthEndStr;

  const visibleSummaries = useMemo(
    () => (isTraineeView ? summaries.filter((s) => s.userId === viewerUserId) : summaries),
    [summaries, isTraineeView, viewerUserId],
  );

  const currentWeekLabel = useMemo(() => {
    const sample = visibleSummaries
      .flatMap((s) => s.weeks)
      .find((w) => w.weekStart === currentWeekStart);
    if (sample) return formatWeekRangeItalian(sample.weekStart, sample.weekEnd);
    const { weekEnd } = weekRangeMondaySunday(currentWeekStart);
    return formatWeekRangeItalian(currentWeekStart, weekEnd);
  }, [visibleSummaries, currentWeekStart]);

  const panelTitle = "Settimana corrente";
  const emptyMessage = isTraineeView
    ? "Nessun turno, ferie o blocco didattico tuo nel mese selezionato."
    : "Nessun specializzando con turni, ferie o blocchi didattici nel mese selezionato.";

  if (visibleSummaries.length === 0) {
    return (
      <details className="rounded-2xl border border-border bg-card px-4 py-3 text-sm" open>
        <summary className="cursor-pointer font-medium text-foreground">{panelTitle}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{emptyMessage}</p>
      </details>
    );
  }

  const anyCurrentWeekInMonth = visibleSummaries.some((s) =>
    s.weeks.some((w) => w.weekStart === currentWeekStart),
  );

  return (
    <details className="rounded-2xl border border-border bg-card px-4 py-3 text-sm open:pb-4" open>
      <summary className="cursor-pointer font-medium text-foreground">{panelTitle}</summary>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {showAllWeeks
            ? `Tutte le settimane del mese (${monthStartStr} — ${monthEndStr}). Il calendario sopra resta la vista mensile completa.`
            : todayInViewedMonth
              ? `${currentWeekLabel} · clicca un giorno per il dettaglio.`
              : "La settimana corrente non cade in questo mese: usa il calendario sopra o apri il riepilogo completo."}
        </p>
        {canExpandToFullMonth ? (
          <div className="flex shrink-0 flex-wrap gap-1.5">
            <Button
              type="button"
              variant={showAllWeeks ? "outline" : "default"}
              size="sm"
              onClick={() => setShowAllWeeks(false)}
            >
              Settimana corrente
            </Button>
            <Button
              type="button"
              variant={showAllWeeks ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllWeeks(true)}
            >
              Tutte le settimane
            </Button>
          </div>
        ) : !showAllWeeks ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setShowAllWeeks(true)}>
            Apri riepilogo completo
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setShowAllWeeks(false)}>
            Solo settimana corrente
          </Button>
        )}
      </div>

      <div
        className={cn(
          "mt-4 space-y-4",
          showAllWeeks && "max-h-[min(70vh,42rem)] overflow-y-auto pr-1",
        )}
      >
        {visibleSummaries.map((summary) => {
          const weeksToShow = weeksForView(summary.weeks, showAllWeeks, currentWeekStart);

          if (weeksToShow.length === 0) {
            return (
              <div key={summary.userId} className="space-y-2">
                {!isTraineeView ? (
                  <p className="text-sm font-semibold text-foreground">{summary.userName}</p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {showAllWeeks
                    ? "Nessuna settimana in questo mese."
                    : todayInViewedMonth
                      ? "Nessun turno previsto nella settimana corrente."
                      : "Settimana corrente non inclusa in questo mese."}
                </p>
              </div>
            );
          }

          return (
            <div key={summary.userId} className="space-y-3">
              {!isTraineeView ? (
                <p className="text-sm font-semibold text-foreground">{summary.userName}</p>
              ) : null}
              {weeksToShow.map((week) => {
                const hasContent = traineePlanningWeekHasContent(week);
                if (!showAllWeeks && !hasContent) {
                  return (
                    <p key={week.weekStart} className="text-sm text-muted-foreground">
                      Nessun turno previsto questa settimana.
                    </p>
                  );
                }
                return (
                  <TraineeWeekCalendar
                    key={`${summary.userId}-${week.weekStart}`}
                    week={week}
                    highlightWeekStart={currentWeekStart}
                  />
                );
              })}
            </div>
          );
        })}

        {!showAllWeeks && !anyCurrentWeekInMonth && todayInViewedMonth ? (
          <p className="text-xs text-muted-foreground">
            Nessun dato per la settimana corrente in questo mese.{" "}
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => setShowAllWeeks(true)}
            >
              Apri riepilogo completo
            </button>
          </p>
        ) : null}
      </div>
    </details>
  );
}
