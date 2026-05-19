import type { LeaveRequestRow, LeaveRequestStatus, LeaveRequestType } from "@/lib/domain/leave-request-shared";
import { LEAVE_REQUESTS_ACTIVE_OVERLAP_STATUSES } from "@/lib/domain/leave-requests-db-contract";

/**
 * Schema reale `leave_requests` (Supabase remoto):
 * user_id, reviewed_by, reviewed_at, cancelled_at, reason, status (in_attesa|approvato|rifiutato|annullato).
 */
export type LeaveRequestDbRow = {
  id: string;
  user_id: string;
  request_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_at: string | null;
  created_at?: string;
  updated_at?: string;
};

const STATUS_FROM_DB: Record<string, LeaveRequestStatus> = {
  in_attesa: "pending",
  approvato: "approved",
  rifiutato: "rejected",
  annullato: "cancelled",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  cancelled: "cancelled",
};

const STATUS_TO_DB: Record<LeaveRequestStatus, string> = {
  pending: "in_attesa",
  approved: "approvato",
  rejected: "rifiutato",
  cancelled: "annullato",
};

const ACTIVE_DB_STATUSES = LEAVE_REQUESTS_ACTIVE_OVERLAP_STATUSES;

export function mapLeaveStatusFromDb(status: string): LeaveRequestStatus {
  return STATUS_FROM_DB[status] ?? "pending";
}

export function mapLeaveStatusToDb(status: LeaveRequestStatus): string {
  return STATUS_TO_DB[status];
}

export function mapLeaveTypeFromDb(type: string): LeaveRequestType {
  switch (type) {
    case "ferie":
    case "vacation":
      return "vacation";
    case "desiderata":
      return "other";
    case "permission":
      return "permission";
    case "sick_leave":
      return "sick_leave";
    case "conference":
      return "conference";
    default:
      return "other";
  }
}

/** Tipi ammessi dall'enum Postgres `leave_request_type` (ferie/desiderata sul DB italiano). */
export function mapLeaveTypeToDb(type: string): "ferie" | "desiderata" {
  if (type === "ferie" || type === "vacation") return "ferie";
  return "desiderata";
}

export function mapLeaveRequestFromDb(raw: Record<string, unknown>): LeaveRequestRow {
  const reason =
    raw.reason != null ? String(raw.reason) : raw.note != null ? String(raw.note) : null;

  return {
    id: String(raw.id ?? ""),
    user_id: String(raw.user_id ?? "").trim(),
    request_type: mapLeaveTypeFromDb(String(raw.request_type ?? "")),
    start_date: String(raw.start_date ?? "").trim().slice(0, 10),
    end_date: String(raw.end_date ?? "").trim().slice(0, 10),
    status: mapLeaveStatusFromDb(String(raw.status ?? "")),
    reason,
    reviewed_by: raw.reviewed_by != null ? String(raw.reviewed_by) : null,
    reviewed_at: raw.reviewed_at != null ? String(raw.reviewed_at) : null,
    review_note: null,
    cancelled_at: raw.cancelled_at != null ? String(raw.cancelled_at) : null,
    created_at: raw.created_at ? String(raw.created_at) : "",
  };
}

export function mapLeaveRequestToDbInsert(payload: {
  userId: string;
  requestType: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}) {
  return {
    user_id: payload.userId,
    request_type: mapLeaveTypeToDb(payload.requestType),
    start_date: payload.startDate,
    end_date: payload.endDate,
    status: "in_attesa" as const,
    reason: payload.reason?.trim() ? payload.reason.trim() : null,
    reviewed_by: null,
    reviewed_at: null,
    cancelled_at: null,
  };
}

export function mapLeaveRequestToDbCancel(cancelledAtIso: string) {
  return {
    status: "annullato" as const,
    reviewed_by: null,
    reviewed_at: null,
    cancelled_at: cancelledAtIso,
  };
}

export function mapLeaveRequestToDbReview(payload: {
  reviewerId: string;
  status: "approvato" | "rifiutato";
  reason?: string | null;
}) {
  return {
    status: payload.status,
    reviewed_by: payload.reviewerId,
    reviewed_at: new Date().toISOString(),
    ...(payload.reason ? { reason: payload.reason } : {}),
  };
}

export function mapLeaveRequestToDbUpdate(payload: {
  requestType: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}) {
  return {
    request_type: mapLeaveTypeToDb(payload.requestType),
    start_date: payload.startDate,
    end_date: payload.endDate,
    reason: payload.reason?.trim() ? payload.reason.trim() : null,
  };
}

export function activeLeaveDbStatuses() {
  return [...ACTIVE_DB_STATUSES];
}
