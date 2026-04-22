"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { hasDateOverlap } from "@/lib/dates/hasDateOverlap";
import { formatDateItalian, type LeaveRequestRow } from "@/lib/domain/leave-request-shared";

import { LeaveRequestsList } from "./leave-requests-list";
import { MonthCalendar } from "./month-calendar";

type FerieMonthViewProps = {
  yearMonth: string;
  initialSelectedDate: string | null;
  rows: LeaveRequestRow[];
  profileId: string;
  profileRole: "specializzando" | "tutor" | "admin";
  month: string;
};

export function FerieMonthView({ yearMonth, initialSelectedDate, rows, profileId, profileRole, month }: FerieMonthViewProps) {
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
      <Card title="Calendario mese" description="Panoramica visiva delle richieste: pending (grigio), approved (verde), rejected (rosso).">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Legenda:</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            <span className="h-2 w-2 rounded-full bg-gray-500" />
            In attesa
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Approvata
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Rifiutata
          </span>
        </div>
        <MonthCalendar
          yearMonth={yearMonth}
          leaves={rows}
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
              {selectedDate ? "Nessuna richiesta per il giorno selezionato." : "Nessuna richiesta nel mese selezionato."}
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
