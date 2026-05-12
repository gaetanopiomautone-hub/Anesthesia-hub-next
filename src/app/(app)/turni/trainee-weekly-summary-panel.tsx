"use client";

import type {
  TraineeWeekSummaryEntry,
  TraineeWeekSummaryEntryCategory,
  TraineeWeeklyPlanningSummaryRow,
} from "@/lib/domain/trainee-weekly-planning-summary";
import { formatWeekRangeItalian, WEEKLY_ASSISTENTIAL_CAP_HOURS } from "@/lib/domain/weekly-assistential-hours";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

function entryTone(cat: TraineeWeekSummaryEntryCategory): string {
  switch (cat) {
    case "assistential":
      return "text-foreground";
    case "reper":
      return "text-violet-900 dark:text-violet-200";
    case "ferie":
      return "text-slate-800 dark:text-slate-200";
    case "desiderata_leave":
    case "desiderata_block":
      return "text-amber-900 dark:text-amber-100";
    case "didattica":
      return "text-sky-900 dark:text-sky-100";
    case "congresso":
      return "text-teal-900 dark:text-teal-100";
    default:
      return "text-muted-foreground";
  }
}

function CellEntries({ entries }: { entries: TraineeWeekSummaryEntry[] }) {
  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <ul className="list-none space-y-0.5">
      {entries.map((e) => (
        <li key={e.id} className={cn("break-words text-[0.7rem] leading-snug sm:text-xs", entryTone(e.category))}>
          {e.label}
        </li>
      ))}
    </ul>
  );
}

type TraineeWeeklySummaryPanelProps = {
  summaries: TraineeWeeklyPlanningSummaryRow[];
  monthStartStr: string;
  monthEndStr: string;
};

export function TraineeWeeklySummaryPanel({ summaries, monthStartStr, monthEndStr }: TraineeWeeklySummaryPanelProps) {
  if (summaries.length === 0) {
    return (
      <details className="rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-foreground">Riepilogo settimanale per specializzando</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Nessun specializzando con turni, ferie o blocchi didattici nel mese selezionato.
        </p>
      </details>
    );
  }

  return (
    <details className="rounded-2xl border border-border bg-card px-4 py-3 text-sm open:pb-4">
      <summary className="cursor-pointer font-medium text-foreground">
        Riepilogo settimanale per specializzando (lun–dom)
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Dati riferiti al periodo {monthStartStr} — {monthEndStr}. Le settimane a cavallo del mese possono essere parziali
        (giorni fuori mese in grigio; ore settimanali contano solo i turni presenti in questa vista).
      </p>
      <div className="mt-4 max-h-[min(70vh,42rem)] space-y-4 overflow-y-auto pr-1">
        {summaries.map((summary) => {
          const anyExceeded = summary.weeks.some((w) => w.exceededWeeklyCap);
          const anyConflicts = summary.weeks.some((w) => w.weekHasConflicts);
          return (
            <Card key={summary.userId} title={summary.userName} className="p-0">
              <div className="flex flex-wrap gap-1.5 border-b border-border/80 px-3 py-2 text-[0.65rem]">
                {anyExceeded ? (
                  <span className="rounded-md bg-rose-100 px-1.5 py-0.5 font-medium text-rose-950 dark:bg-rose-950/40 dark:text-rose-50">
                    Oltre {WEEKLY_ASSISTENTIAL_CAP_HOURS}h in almeno una settimana
                  </span>
                ) : null}
                {anyConflicts ? (
                  <span className="rounded-md bg-orange-100 px-1.5 py-0.5 font-medium text-orange-950 dark:bg-orange-950/40 dark:text-orange-50">
                    Conflitti assistenziali / indisponibilità
                  </span>
                ) : null}
                {!anyExceeded && !anyConflicts ? (
                  <span className="text-muted-foreground">Nessun avviso sulle settimane mostrate.</span>
                ) : null}
              </div>
              <div className="space-y-2 px-2 py-2">
                {summary.weeks.map((week) => (
                  <details
                    key={week.weekStart}
                    className="rounded-lg border border-border/70 bg-muted/20 px-2 py-1 dark:bg-muted/10"
                  >
                    <summary className="cursor-pointer select-none text-xs font-medium text-foreground">
                      <span>{formatWeekRangeItalian(week.weekStart, week.weekEnd)}</span>
                      <span className="ml-2 tabular-nums text-muted-foreground">
                        {week.totalAssistentialHours}h assistenziali
                      </span>
                      {week.reperCount > 0 ? (
                        <span className="ml-2 text-violet-800 dark:text-violet-200">· {week.reperCount} reper</span>
                      ) : null}
                      {week.partialWeekOutOfMonth ? (
                        <span className="ml-2 text-[0.65rem] font-normal text-muted-foreground">(settimana parziale sul mese)</span>
                      ) : null}
                      {week.exceededWeeklyCap ? (
                        <span className="ml-2 text-[0.65rem] font-semibold text-rose-700 dark:text-rose-300">
                          supera {WEEKLY_ASSISTENTIAL_CAP_HOURS}h
                        </span>
                      ) : null}
                      {week.weekHasConflicts ? (
                        <span className="ml-2 text-[0.65rem] font-semibold text-orange-800 dark:text-orange-200">
                          conflitti
                        </span>
                      ) : null}
                    </summary>
                    <div className="mt-2 overflow-x-auto pb-1">
                      <table className="w-full min-w-[32rem] border-collapse text-left text-[0.65rem] sm:text-xs">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="px-1 py-1 font-medium">Giorno</th>
                            <th className="px-1 py-1 font-medium">Mattina</th>
                            <th className="px-1 py-1 font-medium">Pomeriggio</th>
                            <th className="px-1 py-1 font-medium">Reperibilità</th>
                            <th className="px-1 py-1 font-medium">Note</th>
                            <th className="px-1 py-1 text-right font-medium">Ore</th>
                          </tr>
                        </thead>
                        <tbody>
                          {week.days.map((day) => (
                            <tr
                              key={day.date}
                              className={cn(
                                "border-b border-border/60 align-top",
                                !day.isInVisibleMonth && "bg-muted/40 text-muted-foreground dark:bg-muted/25",
                              )}
                            >
                              <td className="whitespace-nowrap px-1 py-1 capitalize">{day.weekdayLabel}</td>
                              <td className="px-1 py-1">
                                <CellEntries entries={day.morningItems} />
                              </td>
                              <td className="px-1 py-1">
                                <CellEntries entries={day.afternoonItems} />
                              </td>
                              <td className="px-1 py-1">
                                <CellEntries entries={day.reperItems} />
                              </td>
                              <td className="px-1 py-1">
                                <div className="space-y-1">
                                  {day.fullDayItems.length > 0 ? (
                                    <div>
                                      <p className="mb-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground">
                                        Tutto il giorno
                                      </p>
                                      <CellEntries entries={day.fullDayItems} />
                                    </div>
                                  ) : null}
                                  {day.conflictMessages.length > 0 ? (
                                    <ul className="list-none space-y-0.5 text-[0.65rem] font-medium text-orange-900 dark:text-orange-100">
                                      {day.conflictMessages.map((m) => (
                                        <li key={m}>{m}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  {day.fullDayItems.length === 0 && day.conflictMessages.length === 0 ? (
                                    <span className="text-muted-foreground">—</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="px-1 py-1 text-right tabular-nums font-medium text-foreground">
                                {day.isInVisibleMonth ? day.assistentialDayHours : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </details>
  );
}
