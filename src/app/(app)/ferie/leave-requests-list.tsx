"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  approveLeaveRequestAction,
  cancelLeaveRequestAction,
  rejectLeaveRequestAction,
  updateLeaveRequestAction,
} from "@/app/(app)/ferie/actions";
import {
  formatDateItalian,
  leaveStatusLabelItalian,
  leaveTypeLabelItalian,
  type LeaveRequestRow,
} from "@/lib/domain/leave-request-shared";
import { hasDateOverlap } from "@/lib/dates/hasDateOverlap";
import type { AppRole } from "@/lib/auth/roles";
import {
  canCancelLeaveRequest,
  canEditLeaveRequest,
  canReviewLeaveRequest,
} from "@/lib/domain/leave-request-permissions";

type LeaveRequestsListProps = {
  rows: LeaveRequestRow[];
  profileId: string;
  profileRole: AppRole;
  month: string;
  day?: string | null;
};

function requesterLabel(row: LeaveRequestRow) {
  const name = row.requester?.full_name?.trim();
  const email = row.requester?.email?.trim();
  if (name && email) return `${name} · ${email}`;
  if (name) return name;
  if (email) return email;
  return "Richiedente";
}

function statusChipClass(status: LeaveRequestRow["status"]) {
  switch (status) {
    case "approved":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "pending":
      return "bg-gray-100 text-gray-800";
    case "cancelled":
    default:
      return "bg-gray-50 text-gray-500";
  }
}

function useDebouncedValue<T>(value: T, delayMs = 150) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

export function LeaveRequestsList({ rows, profileId, profileRole, month, day = null }: LeaveRequestsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const editingRow = useMemo(() => rows.find((r) => r.id === editingId) ?? null, [editingId, rows]);
  const debouncedStart = useDebouncedValue(draftStart, 150);
  const debouncedEnd = useDebouncedValue(draftEnd, 150);

  const overlappingLeave = useMemo(() => {
    if (!editingRow || !debouncedStart || !debouncedEnd) return null;
    return (
      rows.find(
        (r) =>
          r.id !== editingRow.id &&
          r.user_id === editingRow.user_id &&
          (r.status === "pending" || r.status === "approved") &&
          hasDateOverlap(debouncedStart, debouncedEnd, r.start_date, r.end_date),
      ) ?? null
    );
  }, [debouncedEnd, debouncedStart, editingRow, rows]);

  useEffect(() => {
    if (editingId) {
      firstInputRef.current?.focus();
    }
  }, [editingId]);

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const canEdit = canEditLeaveRequest({ request: row, currentUserId: profileId, currentUserRole: profileRole });
        const canCancel = canCancelLeaveRequest({ request: row, currentUserId: profileId, currentUserRole: profileRole });
        const canReview = canReviewLeaveRequest({ request: row, currentUserId: profileId, currentUserRole: profileRole });
        const isEditing = editingId === row.id;

        return (
          <div key={row.id} className="rounded-lg border border-border bg-background p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="font-medium">{requesterLabel(row)}</p>
                <p className="text-sm text-foreground">
                  {formatDateItalian(row.start_date)} → {formatDateItalian(row.end_date)}
                </p>
                <p className="text-xs text-muted-foreground">{leaveTypeLabelItalian(row.request_type)}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusChipClass(row.status)}`}>
                  {leaveStatusLabelItalian(row.status)}
                </span>
                <p className="text-xs text-muted-foreground">Creata il {formatDateItalian(row.created_at)}</p>
                {canEdit ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) {
                          setEditingId(null);
                          setDraftStart("");
                          setDraftEnd("");
                          return;
                        }
                        setEditingId(row.id);
                        setDraftStart(row.start_date);
                        setDraftEnd(row.end_date);
                      }}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      {isEditing ? "Chiudi modifica" : "Modifica"}
                    </button>
                    {!isEditing && canCancel ? (
                      <form
                        action={cancelLeaveRequestAction}
                        onSubmit={(e) => {
                          const ok = window.confirm("Vuoi annullare questa richiesta ferie?");
                          if (!ok) e.preventDefault();
                        }}
                      >
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="day" value={day ?? ""} />
                        <button
                          type="submit"
                          className="rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                        >
                          Annulla richiesta
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {row.reason?.trim() ? <p className="mt-3 text-sm text-muted-foreground">{row.reason}</p> : null}

            {isEditing ? (
              <div className="mt-4 grid gap-3 border-t border-border pt-3">
                {overlappingLeave ? (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
                    Attenzione: esiste già una richiesta dal{" "}
                    <strong>
                      {formatDateItalian(overlappingLeave.start_date)} → {formatDateItalian(overlappingLeave.end_date)}
                    </strong>
                    . Modifica quella esistente oppure scegli altre date.
                  </div>
                ) : null}

                <form action={updateLeaveRequestAction} className="grid gap-2">
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="day" value={day ?? ""} />
                  <select
                    name="requestType"
                    defaultValue={row.request_type}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="vacation">Ferie</option>
                    <option value="permission">Permesso</option>
                    <option value="sick_leave">Malattia</option>
                    <option value="conference">Congresso</option>
                    <option value="other">Altro</option>
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      ref={firstInputRef}
                      name="startDate"
                      type="date"
                      value={draftStart}
                      onChange={(e) => setDraftStart(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    />
                    <input
                      name="endDate"
                      type="date"
                      value={draftEnd}
                      onChange={(e) => setDraftEnd(e.target.value)}
                      className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    />
                  </div>
                  <textarea
                    name="reason"
                    rows={3}
                    defaultValue={row.reason ?? ""}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    placeholder="Aggiorna motivazione o dettagli"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium">
                      Salva modifiche
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setDraftStart("");
                        setDraftEnd("");
                      }}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      Annulla
                    </button>
                  </div>
                </form>
              </div>
            ) : null}

            {!isEditing && canReview ? (
              <div className="mt-4 grid gap-3 border-t border-border pt-3">
                <form action={approveLeaveRequestAction} className="grid gap-2">
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="day" value={day ?? ""} />
                  <input
                    name="adminNote"
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    placeholder="Nota opzionale (appesa alla richiesta)"
                  />
                  <button type="submit" className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Approva
                  </button>
                </form>
                <form action={rejectLeaveRequestAction} className="grid gap-2">
                  <input type="hidden" name="id" value={row.id} />
                  <input type="hidden" name="month" value={month} />
                  <input type="hidden" name="day" value={day ?? ""} />
                  <input
                    name="adminNote"
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                    placeholder="Motivo rifiuto (opzionale ma consigliato)"
                  />
                  <button type="submit" className="rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive">
                    Rifiuta
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
