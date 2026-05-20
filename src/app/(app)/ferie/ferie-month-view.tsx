"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { hasDateOverlap } from "@/lib/dates/hasDateOverlap";
import { formatDateItalian, type LeaveRequestRow } from "@/lib/domain/leave-request-shared";
import type { FerieCalendarBlock } from "@/lib/domain/leave-calendar-markers";

import { LeaveRequestsList } from "./leave-requests-list";
import { MonthCalendar } from "./month-calendar";

type FerieMonthViewProps = {
  yearMonth: string;
  initialSelectedDate: string | null;
  rows: LeaveRequestRow[];
  calendarBlocks: FerieCalendarBlock[];
  profileId: string;
  profileRole: "specializzando" | "tutor" | "admin";
  month: string;
};

export function FerieMonthView({
  yearMonth,
  initialSelectedDate,
  rows,
  calendarBlocks,
  profileId,
  profileRole,
  month,
}: FerieMonthViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filteredRows = useMemo(() => {
    if (!selectedDate) return rows;
    return rows.filter((r) => hasDateOverlap(selectedDate, selectedDate, r.start_date, r.end_date));
  }, [rows, selectedDate]);

  const handleSelectDate = (ymd: string) => {
    const nextSelectedDate = selectedDate === ymd ? null : ymd;
    setSelectedDate(nextSelectedDate);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("month", yearMonth);
    if (nextSelectedDate) {
      nextParams.set("day", nextSelectedDate);
    } else {
      nextParams.delete("day");
    }
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  };

  const clearSelectedDate = () => {
    setSelectedDate(null);
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("month", yearMonth);
    nextParams.delete("day");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  };

  return (
    <>
      <Card
        title="Calendario mese"
        description="Bordo = tipo (ferie blu, congresso viola, lezione arancione). Pill = stato approvazione ferie."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Tipo:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500 bg-blue-50/60 px-2 py-0.5">
            Ferie
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-500 bg-purple-50/60 px-2 py-0.5">
            Congresso
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-orange-500 bg-orange-50/60 px-2 py-0.5">
            Lezione
          </span>
          <span className="mx-1 text-border">|</span>
          <span className="font-medium text-foreground">Stato ferie:</span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5">
            <span className="rounded bg-gray-500 px-1 text-[8px] font-semibold text-white">Att.</span>
            In attesa
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5">
            <span className="rounded bg-green-600 px-1 text-[8px] font-semibold text-white">Ok</span>
            Approvata
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5">
            <span className="rounded bg-red-600 px-1 text-[8px] font-semibold text-white">No</span>
            Rifiutata
          </span>
        </div>
        <MonthCalendar
          yearMonth={yearMonth}
          leaves={rows}
          blocks={calendarBlocks}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      </Card>

      <Card
        title={selectedDate ? `Richieste del ${formatDateItalian(selectedDate)}` : "Stato richieste"}
        description={selectedDate ? "Filtro giorno attivo sulla lista del mese." : undefined}
        className="lg:col-span-2"
      >
        {selectedDate ? (
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground">
              Filtro: {formatDateItalian(selectedDate)}
            </span>
            <button
              type="button"
              onClick={clearSelectedDate}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              × Rimuovi
            </button>
          </div>
        ) : null}

        {filteredRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-4">
            <p className="text-sm text-muted-foreground">
              {selectedDate
                ? "Nessuna richiesta per il giorno selezionato."
                : `Nessuna richiesta per ${yearMonth}. Prova un altro mese dal selettore in alto.`}
            </p>
            <a
              href="#new-leave-request"
              className="mt-3 inline-flex rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Nuova richiesta ferie
            </a>
          </div>
        ) : (
          <LeaveRequestsList rows={filteredRows} profileId={profileId} profileRole={profileRole} month={month} day={selectedDate} />
        )}
      </Card>
    </>
  );
}
