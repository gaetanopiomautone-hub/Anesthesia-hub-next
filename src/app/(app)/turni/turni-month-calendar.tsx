"use client";

import type { ShiftRow } from "@/lib/domain/shift-shared";

type TurniMonthCalendarProps = {
  yearMonth: string;
  shifts: ShiftRow[];
  selectedDate: string | null;
  onSelectDate: (ymd: string) => void;
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

function parseYearMonth(yearMonth: string) {
  const [yearRaw, monthRaw] = yearMonth.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthGrid(yearMonth: string) {
  const parsed = parseYearMonth(yearMonth);
  if (!parsed) return Array.from({ length: 35 }, () => null as string | null);

  const firstDay = new Date(parsed.year, parsed.month - 1, 1);
  const lastDay = new Date(parsed.year, parsed.month, 0);
  const totalDays = lastDay.getDate();
  const firstDayWeekdayMonBased = (firstDay.getDay() + 6) % 7;

  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDayWeekdayMonBased; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(toYmd(new Date(parsed.year, parsed.month - 1, day)));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

export function TurniMonthCalendar({ yearMonth, shifts, selectedDate, onSelectDate }: TurniMonthCalendarProps) {
  const cells = getMonthGrid(yearMonth);
  const shiftCountByDay = new Map<string, number>();
  for (const shift of shifts) {
    shiftCountByDay.set(shift.shift_date, (shiftCountByDay.get(shift.shift_date) ?? 0) + 1);
  }

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
          if (!ymd) return <div key={`empty-${idx}`} className="min-h-[72px] rounded-lg border border-dashed border-border/60 bg-background/50" />;

          const day = Number(ymd.slice(-2));
          const count = shiftCountByDay.get(ymd) ?? 0;
          const isSelected = selectedDate === ymd;

          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelectDate(ymd)}
              className={[
                "min-h-[72px] rounded-lg border bg-background px-2 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                isSelected ? "border-primary bg-primary/10 ring-2 ring-primary/35" : "border-border hover:bg-secondary/40",
              ].join(" ")}
            >
              <div className="text-xs font-medium text-foreground">{day}</div>
              <div className="mt-2 text-[11px] text-muted-foreground">{count > 0 ? `${count} turni` : "—"}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
