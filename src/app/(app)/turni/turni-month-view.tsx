"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";
import type { ShiftRow } from "@/lib/domain/shift-shared";

import { ShiftList } from "./shift-list";
import { TurniMonthCalendar } from "./turni-month-calendar";

type TurniMonthViewProps = {
  yearMonth: string;
  initialSelectedDate: string | null;
  rows: ShiftRow[];
  currentUserId: string;
  currentUserRole: "specializzando" | "tutor" | "admin";
  canPropose: boolean;
  canApprove: boolean;
  assigneeOptions: Array<{ id: string; full_name: string | null; email: string | null }>;
};

export function TurniMonthView({
  yearMonth,
  initialSelectedDate,
  rows,
  currentUserId,
  currentUserRole,
  canPropose,
  canApprove,
  assigneeOptions,
}: TurniMonthViewProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filteredRows = useMemo(() => {
    if (!selectedDate) return rows;
    return rows.filter((row) => row.shift_date === selectedDate);
  }, [rows, selectedDate]);

  const updateUrl = (nextSelectedDate: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("month", yearMonth);
    if (nextSelectedDate) nextParams.set("day", nextSelectedDate);
    else nextParams.delete("day");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
  };

  const handleSelectDate = (ymd: string) => {
    const nextSelectedDate = selectedDate === ymd ? null : ymd;
    setSelectedDate(nextSelectedDate);
    updateUrl(nextSelectedDate);
  };

  return (
    <>
      <Card title="Calendario mese" description="Vista rapida turni del mese.">
        <TurniMonthCalendar yearMonth={yearMonth} shifts={rows} selectedDate={selectedDate} onSelectDate={handleSelectDate} />
      </Card>

      <Card
        title={selectedDate ? `Turni del ${formatDateItalian(selectedDate)}` : "Turni del mese"}
        description={selectedDate ? "Filtro giorno attivo sulla lista turni." : "Seleziona un giorno dal calendario per filtrare."}
        className="lg:col-span-2"
      >
        {selectedDate ? (
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground">
              Filtro: {formatDateItalian(selectedDate)}
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedDate(null);
                updateUrl(null);
              }}
              className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              × Rimuovi
            </button>
          </div>
        ) : null}

        <ShiftList
          rows={filteredRows}
          month={yearMonth}
          day={selectedDate}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          canPropose={canPropose}
          canApprove={canApprove}
          assigneeOptions={assigneeOptions}
        />
      </Card>
    </>
  );
}
