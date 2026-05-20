/**
 * Contratto schema `public.leave_requests` (DB remoto = fonte di verità).
 * Aggiornare solo dopo migration esplicita + schema guard verde.
 */
export const LEAVE_REQUESTS_TABLE = "leave_requests" as const;

/** Colonne attese su `leave_requests` (ordine documentativo). */
export const LEAVE_REQUESTS_COLUMNS = [
  "id",
  "user_id",
  "request_type",
  "start_date",
  "end_date",
  "status",
  "reason",
  "reviewed_by",
  "reviewed_at",
  "cancelled_at",
  "created_at",
  "updated_at",
] as const;

export type LeaveRequestsColumn = (typeof LEAVE_REQUESTS_COLUMNS)[number];

/** Colonne usate dalle query `.select(...)` lato app. */
export const LEAVE_REQUESTS_SELECT_COLUMNS = [
  "id",
  "user_id",
  "request_type",
  "start_date",
  "end_date",
  "status",
  "reason",
  "reviewed_by",
  "reviewed_at",
  "cancelled_at",
  "created_at",
] as const;

/** Stati enum Postgres (approval_status su ferie). */
export const LEAVE_REQUESTS_STATUSES = ["in_attesa", "approvato", "rifiutato", "annullato"] as const;

/** Valori `status` da usare nelle query PostgREST (mai `pending`/`approved` inglesi). */
export const LEAVE_REQUEST_DB_STATUS = {
  pending: "in_attesa",
  approved: "approvato",
  rejected: "rifiutato",
  cancelled: "annullato",
} as const satisfies Record<string, (typeof LEAVE_REQUESTS_STATUSES)[number]>;

/** Stati che partecipano al controllo overlap server-side. */
export const LEAVE_REQUESTS_ACTIVE_OVERLAP_STATUSES = ["in_attesa", "approvato"] as const;

export const LEAVE_REQUESTS_INTEGRITY_CONSTRAINT = "leave_requests_approval_integrity" as const;

export const LEAVE_REQUESTS_RLS_POLICIES = [
  "leave_select_own_or_scheduler_admin",
  "leave_insert_own_pending",
  "leave_update_own_only_pending",
  "leave_update_scheduler_admin_approval",
] as const;

/** Marker nel blocco SQL ferie: se spariscono, il guard fallisce. */
export const LEAVE_REQUESTS_POLICY_MARKERS = [
  "user_id = auth.uid()",
  "reviewed_by is null",
  "reviewed_at is null",
  "cancelled_at is null",
  "status = 'annullato' and cancelled_at is not null",
  "status in ('approvato', 'rifiutato')",
  "reviewed_by = auth.uid()",
] as const;

/** Nomi legacy del refactor teorico — non devono comparire nel modulo ferie. */
export const LEAVE_REQUESTS_FORBIDDEN_LEGACY_COLUMNS = [
  "requester_profile_id",
  "approved_by",
  "approved_at",
  "note",
] as const;

export const LEAVE_REQUESTS_FORBIDDEN_LEGACY_MARKERS = [
  "requester_profile_id = auth.uid()",
] as const;
