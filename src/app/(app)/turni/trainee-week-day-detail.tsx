"use client";

import type {
  TraineeWeekSummaryDay,
  TraineeWeekSummaryEntry,
  TraineeWeekSummaryEntryCategory,
} from "@/lib/domain/trainee-weekly-planning-summary";
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

function EntryBody({ entry }: { entry: TraineeWeekSummaryEntry }) {
  if (entry.category === "assistential" && entry.locationPrimary) {
    return (
      <>
        <p className="font-medium leading-snug">{entry.locationPrimary}</p>
        {entry.locationSecondary ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{entry.locationSecondary}</p>
        ) : null}
      </>
    );
  }
  if (entry.category === "reper") {
    return (
      <>
        <p className="font-medium leading-snug">Reperibilità</p>
        {entry.locationLabel ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{entry.locationLabel}</p>
        ) : null}
      </>
    );
  }
  return <span className="leading-snug">{entry.label}</span>;
}

function EntryList({ title, entries }: { title: string; entries: TraineeWeekSummaryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="list-none space-y-1">
        {entries.map((e) => (
          <li key={e.id} className={cn("rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-sm", entryTone(e.category))}>
            <EntryBody entry={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TraineeWeekDayDetail({ day }: { day: TraineeWeekSummaryDay }) {
  const hasContent =
    day.morningItems.length > 0 ||
    day.afternoonItems.length > 0 ||
    day.reperItems.length > 0 ||
    day.fullDayItems.length > 0 ||
    day.conflictMessages.length > 0;

  if (!day.isInVisibleMonth) {
    return (
      <p className="text-sm text-muted-foreground">
        Giorno fuori dal mese visualizzato: nessun dato di planning in questa vista.
      </p>
    );
  }

  if (!hasContent) {
    return <p className="text-sm text-muted-foreground">Nessun turno o attività registrata per questo giorno.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ore assistenziali del giorno:{" "}
        <span className="font-semibold tabular-nums text-foreground">{day.assistentialDayHours}h</span>
      </p>
      <EntryList title="Mattina" entries={day.morningItems} />
      <EntryList title="Pomeriggio" entries={day.afternoonItems} />
      <EntryList title="Reperibilità" entries={day.reperItems} />
      <EntryList title="Tutto il giorno" entries={day.fullDayItems} />
      {day.conflictMessages.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-800 dark:text-orange-200">
            Conflitti
          </h3>
          <ul className="list-none space-y-1 text-sm font-medium text-orange-900 dark:text-orange-100">
            {day.conflictMessages.map((m) => (
              <li key={m} className="rounded-md border border-orange-200/80 bg-orange-50/90 px-2.5 py-2 dark:border-orange-900/50 dark:bg-orange-950/30">
                {m}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
