"use client";

import { useMemo, useState } from "react";

import type { LeaveRequestStatus } from "@/lib/data/leave-requests";
import { hasDateOverlap } from "@/lib/dates/hasDateOverlap";

type ExistingLeave = {
  start: string;
  end: string;
  status: LeaveRequestStatus;
};

type NewLeaveRequestFormProps = {
  month: string;
  monthLabel: string;
  defaultStartDate?: string;
  defaultEndDate?: string;
  minDate?: string;
  maxDate?: string;
  existingLeaves: ExistingLeave[];
  action: (formData: FormData) => void | Promise<void>;
};

export function NewLeaveRequestForm({
  month,
  monthLabel,
  defaultStartDate,
  defaultEndDate,
  minDate,
  maxDate,
  existingLeaves,
  action,
}: NewLeaveRequestFormProps) {
  const [startDate, setStartDate] = useState(defaultStartDate ?? "");
  const [endDate, setEndDate] = useState(defaultEndDate ?? "");

  const overlappingLeave = useMemo(() => {
    if (!startDate || !endDate) return null;
    return (
      existingLeaves.find(
        (leave) =>
          (leave.status === "pending" || leave.status === "approved") &&
          hasDateOverlap(startDate, endDate, leave.start, leave.end),
      ) ?? null
    );
  }, [endDate, existingLeaves, startDate]);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="month" value={month} />

      <p className="rounded-lg border border-border bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
        Stai inserendo una richiesta per {monthLabel}.
      </p>

      {overlappingLeave ? (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
          Attenzione: esiste gia una richiesta in questo periodo ({overlappingLeave.start} → {overlappingLeave.end}).
        </div>
      ) : null}

      <select name="requestType" className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
        <option value="vacation">Ferie</option>
        <option value="permission">Permesso</option>
        <option value="sick_leave">Malattia</option>
        <option value="conference">Congresso</option>
        <option value="other">Altro</option>
      </select>
      <input
        name="startDate"
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        min={minDate}
        max={maxDate}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <input
        name="endDate"
        type="date"
        value={endDate}
        onChange={(e) => setEndDate(e.target.value)}
        min={minDate}
        max={maxDate}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      <textarea
        name="reason"
        rows={4}
        className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        placeholder="Motivazione sintetica o preferenza di rotazione"
      />
      <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
        Invia richiesta
      </button>
    </form>
  );
}
