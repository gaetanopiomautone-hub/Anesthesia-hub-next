"use client";

import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";
import {
  buildCalendarMarkersForDay,
  CALENDAR_EVENT_BORDER,
  CALENDAR_STATUS_PILL,
  calendarStatusPillLabel,
  type CalendarMarker,
  type FerieCalendarBlock,
} from "@/lib/domain/leave-calendar-markers";
import { formatYmd, isValidYearMonth, parseYmd, toLocalDateFromYmd } from "@/lib/dates/ymd";

type MonthCalendarProps = {
  yearMonth: string;
  leaves: LeaveRequestRow[];
  blocks: FerieCalendarBlock[];
  selectedDate: string | null;
  onSelectDate: (ymd: string) => void;
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

function getMonthGrid(yearMonth: string) {
  if (!isValidYearMonth(yearMonth)) return Array.from({ length: 35 }, () => null as string | null);

  const { year, month } = parseYmd(`${yearMonth}-01`);
  const firstDay = toLocalDateFromYmd(`${yearMonth}-01`);
  const lastDay = new Date(year, month, 0, 12, 0, 0, 0);
  const totalDays = lastDay.getDate();
  const firstDayWeekdayMonBased = (firstDay.getDay() + 6) % 7;

  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDayWeekdayMonBased; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(formatYmd({ year, month, day }));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function MarkerChip({ marker }: { marker: CalendarMarker }) {
  const border = CALENDAR_EVENT_BORDER[marker.kind];
  if (marker.kind === "leave" && marker.status !== "cancelled") {
    return (
      <span
        className={`inline-flex max-w-full items-center gap-0.5 rounded border px-1 py-0.5 ${border}`}
        title={`Ferie · ${marker.status}`}
      >
        <span className={`rounded px-0.5 text-[8px] font-semibold leading-none ${CALENDAR_STATUS_PILL[marker.status]}`}>
          {calendarStatusPillLabel(marker.status)}
        </span>
      </span>
    );
  }
  if (marker.kind === "congress") {
    return (
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border-2 ${border}`} title="Congresso" />
    );
  }
  if (marker.kind === "lesson") {
    return (
      <span
        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border-2 ${border}`}
        title={marker.title ? `Lezione: ${marker.title}` : "Lezione"}
      />
    );
  }
  return null;
}

export function MonthCalendar({ yearMonth, leaves, blocks, selectedDate, onSelectDate }: MonthCalendarProps) {
  const cells = getMonthGrid(yearMonth);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 text-center text-xs font-medium text-muted-foreground">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((ymd, idx) => {
          if (!ymd) {
            return <div key={`empty-${idx}`} className="min-h-[72px] rounded-lg border border-dashed border-border/60 bg-background/50 md:min-h-[84px]" />;
          }

          const day = Number(ymd.slice(-2));
          const markers = buildCalendarMarkersForDay({ ymd, leaves, blocks }).filter(
            (m) => m.kind !== "leave" || m.status !== "cancelled",
          );
          const displayMarkers = markers.slice(0, 4);
          const extra = markers.length - displayMarkers.length;
          const isSelected = selectedDate === ymd;

          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelectDate(ymd)}
              className={[
                "min-h-[72px] rounded-lg border bg-background px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-[84px]",
                isSelected
                  ? "border-primary bg-primary/10 ring-2 ring-primary/35"
                  : "border-border hover:bg-secondary/40",
              ].join(" ")}
            >
              <div className="text-xs font-medium text-foreground">{day}</div>
              {displayMarkers.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {displayMarkers.map((m) => (
                    <MarkerChip key={`${m.kind}-${m.id}`} marker={m} />
                  ))}
                  {extra > 0 ? <span className="text-[10px] text-muted-foreground">+{extra}</span> : null}
                </div>
              ) : (
                <div className="mt-2 text-[10px] text-muted-foreground">—</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
