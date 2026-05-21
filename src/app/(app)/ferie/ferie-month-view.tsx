"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";
import type { FerieCalendarBlock } from "@/lib/domain/leave-calendar-markers";

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
      description="Bordo = tipo (ferie blu, congresso viola, lezione arancione). Pill = stato approvazione ferie. Clicca un giorno per filtrare la lista sotto."
    >
      <FerieMonthNav yearMonth={yearMonth} selectedDay={selectedDate} />
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
        leaves={calendarRows}
        blocks={calendarBlocks}
        selectedDate={selectedDate}
        onSelectDate={handleSelectDate}
      />
    </Card>
  );
}
