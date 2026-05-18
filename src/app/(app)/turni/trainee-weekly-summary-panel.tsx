"use client";

import Link from "next/link";
import { format, startOfWeek } from "date-fns";

import { TraineeWeekCalendar } from "@/app/(app)/turni/trainee-week-calendar";
import type { TraineeWeeklyPlanningSummaryRow } from "@/lib/domain/trainee-weekly-planning-summary";
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

export function TraineeWeeklySummaryPanel({
  summaries,
  monthStartStr,
  monthEndStr,
  viewerRole,
  viewerUserId,
}: TraineeWeeklySummaryPanelProps) {
  const isTraineeView = viewerRole === "specializzando";
  const currentWeekStart = currentWeekStartMonday();

  const visibleSummaries = isTraineeView
    ? summaries.filter((s) => s.userId === viewerUserId)
    : summaries;

  const panelTitle = isTraineeView ? "La mia settimana (mese)" : "Riepilogo settimanale specializzandi";
  const emptyMessage = isTraineeView
    ? "Nessun turno, ferie o blocco didattico tuo nel mese selezionato."
    : "Nessun specializzando con turni, ferie o blocchi didattici nel mese selezionato.";

  if (visibleSummaries.length === 0) {
    return (
      <details
        className="rounded-2xl border border-border bg-card px-4 py-3 text-sm"
        open={isTraineeView}
      >
        <summary className="cursor-pointer font-medium text-foreground">{panelTitle}</summary>
        <p className="mt-2 text-xs text-muted-foreground">{emptyMessage}</p>
        {isTraineeView ? (
          <p className="mt-2 text-xs">
            <Link href="/turni" className="text-primary underline-offset-2 hover:underline">
              Vai al planning mensile
            </Link>
          </p>
        ) : null}
      </details>
    );
  }

  return (
    <details
      className="rounded-2xl border border-border bg-card px-4 py-3 text-sm open:pb-4"
      open={isTraineeView}
    >
      <summary className="cursor-pointer font-medium text-foreground">{panelTitle}</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {isTraineeView
          ? "Settimane del mese in vista compatta (lun–dom). Clicca un giorno per il dettaglio."
          : `Periodo ${monthStartStr} — ${monthEndStr}. Vista compatta per collega; settimane a cavallo del mese possono essere parziali.`}
      </p>
      <div
        className={cn(
          "mt-4 space-y-4",
          !isTraineeView && "max-h-[min(70vh,42rem)] overflow-y-auto pr-1",
        )}
      >
        {visibleSummaries.map((summary) => {
          const sortedWeeks = [...summary.weeks].sort((a, b) => {
            if (a.weekStart === currentWeekStart) return -1;
            if (b.weekStart === currentWeekStart) return 1;
            return a.weekStart.localeCompare(b.weekStart);
          });

          return (
            <div key={summary.userId} className="space-y-3">
              {!isTraineeView ? (
                <p className="text-sm font-semibold text-foreground">{summary.userName}</p>
              ) : null}
              {sortedWeeks.map((week) => (
                <TraineeWeekCalendar
                  key={`${summary.userId}-${week.weekStart}`}
                  week={week}
                  highlightWeekStart={currentWeekStart}
                />
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}
