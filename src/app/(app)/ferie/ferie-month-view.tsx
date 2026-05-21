"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";
import {
  CALENDAR_EVENT_CHIP,
  CALENDAR_EVENT_SHORT_LABEL,
  CALENDAR_STATUS_PILL,
  calendarStatusPillLabel,
  type FerieCalendarBlock,
} from "@/lib/domain/leave-calendar-markers";

import { FerieMonthNav } from "./ferie-month-nav";
import { MonthCalendar } from "./month-calendar";

type FerieMonthViewProps = {
  yearMonth: string;
  initialSelectedDate: string | null;
  calendarRows: LeaveRequestRow[];
  calendarBlocks: FerieCalendarBlock[];
};

export function FerieMonthView({
  yearMonth,
  initialSelectedDate,
  calendarRows,
  calendarBlocks,
}: FerieMonthViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
    <Card
      title="Calendario mese"
      description="Chip colorato = tipo evento (FER, CONG, LEZ). Pill = stato approvazione ferie. Clicca un giorno per filtrare la lista sotto."
    >
      <FerieMonthNav yearMonth={yearMonth} selectedDay={selectedDate} />
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Tipo:</span>
        <span className="inline-flex items-center gap-1">
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${CALENDAR_EVENT_CHIP.leave}`}
          >
            {CALENDAR_EVENT_SHORT_LABEL.leave}
          </span>
          Ferie
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${CALENDAR_EVENT_CHIP.congress}`}
          >
            {CALENDAR_EVENT_SHORT_LABEL.congress}
          </span>
          Congresso
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${CALENDAR_EVENT_CHIP.lesson}`}
          >
            {CALENDAR_EVENT_SHORT_LABEL.lesson}
          </span>
          Lezione
        </span>
        <span className="mx-1 text-border">|</span>
        <span className="font-medium text-foreground">Stato ferie:</span>
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${CALENDAR_STATUS_PILL.pending}`}>
            {calendarStatusPillLabel("pending")}
          </span>
          In attesa
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${CALENDAR_STATUS_PILL.approved}`}>
            {calendarStatusPillLabel("approved")}
          </span>
          Approvata
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`rounded px-1 py-0.5 text-[9px] font-semibold ${CALENDAR_STATUS_PILL.rejected}`}>
            {calendarStatusPillLabel("rejected")}
          </span>
          Rifiutata
        </span>
      </div>
      <MonthCalendar
        yearMonth={yearMonth}
        leaves={calendarRows}
        blocks={calendarBlocks}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
      />
    </Card>
  );
}
