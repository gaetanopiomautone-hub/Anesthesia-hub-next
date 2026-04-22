"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { formatDateItalian, type LeaveRequestRow } from "@/lib/data/leave-requests";
import { hasDateOverlap } from "@/lib/dates/hasDateOverlap";

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

  return (
    <>
      <Card title="Calendario mese" description="Panoramica visiva delle richieste: pending (grigio), approved (verde), rejected (rosso).">
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
            <span className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
              Filtro: {formatDateItalian(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => setSelectedDate(null)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary"
            >
              Rimuovi filtro
            </button>
          </div>
        ) : null}

        {filteredRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna richiesta per il giorno selezionato.</p>
        ) : (
          <LeaveRequestsList rows={filteredRows} profileId={profileId} profileRole={profileRole} month={month} />
        )}
      </Card>
    </>
  );
}
