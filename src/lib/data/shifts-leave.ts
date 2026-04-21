import { addMonths, endOfMonth, format, isValid, parse, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { formatDateItalian, leaveTypeLabelItalian, type LeaveRequestStatus, type LeaveRequestType } from "@/lib/data/leave-requests";

export type ShiftKind = "mattina" | "pomeriggio" | "giornaliero" | "notte" | "guardia" | "reperibilita";

export type ShiftListRow = {
  id: string;
  shift_date: string;
  shift_kind: ShiftKind;
  assignee_profile_id: string | null;
  clinical_locations: { name: string; area_type: "sala_operatoria" | "rianimazione" } | null;
  assignee?: { full_name: string | null; email: string | null } | null;
};

export type LeaveMonthRow = {
  id: string;
  user_id: string;
  request_type: LeaveRequestType;
  start_date: string;
  end_date: string;
  status: LeaveRequestStatus;
  requester?: { full_name: string | null; email: string | null } | null;
};

export type ShiftLeaveAlert = "none" | "soft" | "hard";

export type ShiftWithLeaveUi = ShiftListRow & {
  leaveStatus: "none" | LeaveRequestStatus;
  alert: ShiftLeaveAlert;
};

export type ConflictRow = {
  leave: LeaveMonthRow;
  impactedShifts: ShiftListRow[];
  kind: "soft" | "hard";
};

const MONTH_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function shiftKindLabelItalian(kind: ShiftKind) {
  switch (kind) {
    case "mattina":
      return "Mattina";
    case "pomeriggio":
      return "Pomeriggio";
    case "giornaliero":
      return "Giornaliero";
    case "notte":
      return "Notte";
    case "guardia":
      return "Guardia";
    case "reperibilita":
      return "Reperibilità";
    default:
      return kind;
  }
}

function areaTypeShort(areaType: "sala_operatoria" | "rianimazione") {
  return areaType === "rianimazione" ? "Rianimazione" : "Sala op.";
}

export function shiftAreaLabel(shift: ShiftListRow) {
  const loc = shift.clinical_locations;
  if (!loc) return "—";
  return `${loc.name} · ${areaTypeShort(loc.area_type)}`;
}

/** `m` query: `yyyy-MM`. Default: mese corrente (server). */
export function resolveTurniFerieMonth(mParam: string | undefined): {
  yearMonth: string;
  monthStart: string;
  monthEnd: string;
  monthLabel: string;
} {
  const fallback = new Date();
  let base = fallback;
  if (mParam && MONTH_PARAM_RE.test(mParam)) {
    const parsed = parse(mParam, "yyyy-MM", new Date());
    if (isValid(parsed)) base = parsed;
  }
  const monthStart = format(startOfMonth(base), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(base), "yyyy-MM-dd");
  const yearMonth = format(base, "yyyy-MM");
  const monthLabel = format(base, "MMMM yyyy", { locale: it });
  return { yearMonth, monthStart, monthEnd, monthLabel };
}

export function adjacentMonthYearMonth(yearMonth: string, delta: -1 | 1): string {
  const parsed = parse(yearMonth, "yyyy-MM", new Date());
  if (!isValid(parsed)) return format(new Date(), "yyyy-MM");
  return format(addMonths(parsed, delta), "yyyy-MM");
}

export function dateInLeaveRange(shiftDate: string, leave: Pick<LeaveMonthRow, "start_date" | "end_date">) {
  return shiftDate >= leave.start_date && shiftDate <= leave.end_date;
}

function leavesForAssigneeOnDate(
  assigneeId: string | null,
  shiftDate: string,
  leaves: LeaveMonthRow[],
): LeaveMonthRow[] {
  if (!assigneeId) return [];
  return leaves.filter((l) => l.user_id === assigneeId && dateInLeaveRange(shiftDate, l));
}

function pickLeaveStatusForDisplay(candidates: LeaveMonthRow[]): "none" | LeaveRequestStatus {
  if (candidates.length === 0) return "none";
  if (candidates.some((l) => l.status === "approved")) return "approved";
  if (candidates.some((l) => l.status === "pending")) return "pending";
  if (candidates.some((l) => l.status === "rejected")) return "rejected";
  return "none";
}

function pickAlert(assigneeId: string | null, candidates: LeaveMonthRow[]): ShiftLeaveAlert {
  if (!assigneeId) return "none";
  const hasApproved = candidates.some((l) => l.status === "approved");
  const hasPending = candidates.some((l) => l.status === "pending");
  if (hasApproved) return "hard";
  if (hasPending) return "soft";
  return "none";
}

export function buildShiftRowsWithLeaveUi(shifts: ShiftListRow[], leaves: LeaveMonthRow[]): ShiftWithLeaveUi[] {
  return shifts.map((shift) => {
    const assigneeId = shift.assignee_profile_id;
    const candidates = assigneeId ? leavesForAssigneeOnDate(assigneeId, shift.shift_date, leaves) : [];
    const leaveStatus = pickLeaveStatusForDisplay(candidates);
    const alert = assigneeId ? pickAlert(assigneeId, candidates) : "none";
    return { ...shift, leaveStatus, alert };
  });
}

export function buildConflictRows(shifts: ShiftListRow[], leaves: LeaveMonthRow[], monthStart: string, monthEnd: string): ConflictRow[] {
  const rows: ConflictRow[] = [];
  for (const leave of leaves) {
    if (leave.status === "rejected") continue;
    if (leave.end_date < monthStart || leave.start_date > monthEnd) continue;

    const impacted = shifts.filter(
      (s) =>
        s.assignee_profile_id === leave.user_id &&
        s.assignee_profile_id !== null &&
        dateInLeaveRange(s.shift_date, leave),
    );
    if (impacted.length === 0) continue;
    rows.push({
      leave,
      impactedShifts: impacted.sort((a, b) => a.shift_date.localeCompare(b.shift_date) || a.shift_kind.localeCompare(b.shift_kind)),
      kind: leave.status === "approved" ? "hard" : "soft",
    });
  }
  return rows.sort((a, b) => a.leave.start_date.localeCompare(b.leave.start_date) || a.leave.id.localeCompare(b.leave.id));
}

/** Conta turni con alert soft/hard (stessa logica per specializzando e vista staff). */
export function countShiftOverlapAlerts(rows: ShiftWithLeaveUi[]) {
  let soft = 0;
  let hard = 0;
  for (const r of rows) {
    if (r.alert === "soft") soft += 1;
    if (r.alert === "hard") hard += 1;
  }
  return { soft, hard, total: soft + hard };
}

export function requesterDisplayName(leave: LeaveMonthRow) {
  const n = leave.requester?.full_name?.trim();
  const e = leave.requester?.email?.trim();
  if (n && e) return `${n} (${e})`;
  if (n) return n;
  if (e) return e;
  return "Specializzando";
}

export function assigneeDisplayName(shift: ShiftListRow) {
  const n = shift.assignee?.full_name?.trim();
  const e = shift.assignee?.email?.trim();
  if (n && e) return `${n}`;
  if (n) return n;
  if (e) return e;
  return shift.assignee_profile_id ? "Assegnato" : "—";
}

async function listShiftsInMonth(params: {
  monthStart: string;
  monthEnd: string;
  assigneeId: string | null;
  viewAll: boolean;
}) {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("shifts")
    .select(
      `
      id,
      shift_date,
      shift_kind,
      assignee_profile_id,
      clinical_locations ( name, area_type ),
      assignee:profiles!shifts_assignee_profile_id_fkey ( full_name, email )
    `,
    )
    .gte("shift_date", params.monthStart)
    .lte("shift_date", params.monthEnd)
    .order("shift_date", { ascending: true })
    .order("shift_kind", { ascending: true });

  if (!params.viewAll && params.assigneeId) {
    query = query.eq("assignee_profile_id", params.assigneeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`shifts month query failed: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const row = raw as Omit<ShiftListRow, "clinical_locations" | "assignee"> & {
      clinical_locations:
        | { name: string; area_type: "sala_operatoria" | "rianimazione" }
        | { name: string; area_type: "sala_operatoria" | "rianimazione" }[]
        | null;
      assignee: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
    };

    return {
      id: row.id,
      shift_date: row.shift_date,
      shift_kind: row.shift_kind as ShiftKind,
      assignee_profile_id: row.assignee_profile_id,
      clinical_locations: firstOrNull(row.clinical_locations),
      assignee: firstOrNull(row.assignee),
    } satisfies ShiftListRow;
  });
}

async function listLeavesOverlappingMonth(params: { monthStart: string; monthEnd: string; assigneeId: string | null; viewAll: boolean }) {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("leave_requests")
    .select(
      `
      id,
      user_id,
      request_type,
      start_date,
      end_date,
      status,
      requester:profiles!leave_requests_user_id_fkey ( full_name, email )
    `,
    )
    .lte("start_date", params.monthEnd)
    .gte("end_date", params.monthStart)
    .order("start_date", { ascending: true });

  if (!params.viewAll && params.assigneeId) {
    query = query.eq("user_id", params.assigneeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`leave_requests month query failed: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const row = raw as Omit<LeaveMonthRow, "requester"> & {
      requester: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
    };

    return {
      ...row,
      request_type: row.request_type as LeaveRequestType,
      status: row.status as LeaveRequestStatus,
      requester: firstOrNull(row.requester),
    } satisfies LeaveMonthRow;
  });
}

export async function listSpecializzandiForFilter(profile: CurrentUserProfile) {
  if (profile.role !== "admin") return [];

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "specializzando")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`profiles list failed: ${error.message}`);
  }

  return (data ?? []) as { id: string; full_name: string; email: string }[];
}

export async function loadTurniFeriePageData(
  profile: CurrentUserProfile,
  params: { monthStart: string; monthEnd: string; assigneeId: string | null },
) {
  const isTrainee = profile.role === "specializzando";
  const isAdmin = profile.role === "admin";
  const viewAll = isAdmin ? params.assigneeId === null : !isTrainee;

  const effectiveAssignee = isTrainee ? profile.id : params.assigneeId;

  const [shifts, leaves] = await Promise.all([
    listShiftsInMonth({
      monthStart: params.monthStart,
      monthEnd: params.monthEnd,
      assigneeId: effectiveAssignee,
      viewAll,
    }),
    listLeavesOverlappingMonth({
      monthStart: params.monthStart,
      monthEnd: params.monthEnd,
      assigneeId: effectiveAssignee,
      viewAll,
    }),
  ]);

  const shiftUi = buildShiftRowsWithLeaveUi(shifts, leaves);
  const conflicts = buildConflictRows(shifts, leaves, params.monthStart, params.monthEnd);
  const assigneeOptions = await listSpecializzandiForFilter(profile);

  return {
    shifts,
    shiftUi,
    leaves,
    conflicts,
    assigneeOptions,
  };
}

export { formatDateItalian, leaveTypeLabelItalian };
