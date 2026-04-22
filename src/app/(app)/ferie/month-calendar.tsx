 "use client";

import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";

type MonthCalendarProps = {
  yearMonth: string;
  leaves: LeaveRequestRow[];
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
  const firstDayWeekdayMonBased = (firstDay.getDay() + 6) % 7; // Mon=0 ... Sun=6

  const cells: Array<string | null> = [];
  for (let i = 0; i < firstDayWeekdayMonBased; i += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(toYmd(new Date(parsed.year, parsed.month - 1, day)));
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

function hasOverlapDay(leave: LeaveRequestRow, ymd: string) {
  return leave.start_date <= ymd && leave.end_date >= ymd;
}

type MarkerKey = "pending" | "approved" | "rejected";

function markersForDay(leaves: LeaveRequestRow[], ymd: string): Record<MarkerKey, number> {
  const markers: Record<MarkerKey, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const leave of leaves) {
    if (leave.status === "cancelled") continue;
    if (!hasOverlapDay(leave, ymd)) continue;
    if (leave.status === "pending") markers.pending += 1;
    if (leave.status === "approved") markers.approved += 1;
    if (leave.status === "rejected") markers.rejected += 1;
  }
  return markers;
}

function markerClass(key: MarkerKey) {
  switch (key) {
    case "approved":
      return "bg-green-500";
    case "rejected":
      return "bg-red-500";
    case "pending":
    default:
      return "bg-gray-500";
  }
}

export function MonthCalendar({ yearMonth, leaves, selectedDate, onSelectDate }: MonthCalendarProps) {
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
          const markers = markersForDay(leaves, ymd);
          const keys = (["pending", "approved", "rejected"] as const).filter((k) => markers[k] > 0);
          const total = markers.pending + markers.approved + markers.rejected;

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
              {total > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {keys.map((k) => (
                    <span key={k} className={`inline-block h-2.5 w-2.5 rounded-full ${markerClass(k)}`} title={`${k}: ${markers[k]}`} />
                  ))}
                  <span className="ml-1 text-[10px] text-muted-foreground">{total}</span>
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
