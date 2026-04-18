import { format } from "date-fns";
import { it } from "date-fns/locale";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LeaveRequestStatus = "in_attesa" | "approvato" | "rifiutato";
export type LeaveRequestType = "ferie" | "desiderata";

export type LeaveRequestRow = {
  id: string;
  requester_profile_id: string;
  request_type: LeaveRequestType;
  start_date: string;
  end_date: string;
  status: LeaveRequestStatus;
  note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  requester?: { full_name: string | null; email: string | null } | null;
  approver?: { full_name: string | null; email: string | null } | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function leaveStatusLabelItalian(status: LeaveRequestStatus) {
  switch (status) {
    case "in_attesa":
      return "In attesa";
    case "approvato":
      return "Approvato";
    case "rifiutato":
      return "Rifiutato";
    default:
      return status;
  }
}

export function leaveTypeLabelItalian(type: LeaveRequestType) {
  switch (type) {
    case "ferie":
      return "Ferie";
    case "desiderata":
      return "Desiderata";
    default:
      return type;
  }
}

export function formatDateItalian(value: string) {
  return format(new Date(value), "dd/MM/yyyy", { locale: it });
}

export async function listLeaveRequests(profile: CurrentUserProfile) {
  const supabase = await createServerSupabaseClient();

  const query = supabase
    .from("leave_requests")
    .select(
      `
      id,
      requester_profile_id,
      request_type,
      start_date,
      end_date,
      status,
      note,
      approved_by,
      approved_at,
      created_at,
      requester:profiles!leave_requests_requester_profile_id_fkey ( full_name, email ),
      approver:profiles!leave_requests_approved_by_fkey ( full_name, email )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (profile.role === "specializzando") {
    query.eq("requester_profile_id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`leave_requests list failed: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const row = raw as Omit<LeaveRequestRow, "requester" | "approver"> & {
      requester: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
      approver: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
    };

    return {
      ...row,
      requester: firstOrNull(row.requester),
      approver: firstOrNull(row.approver),
    };
  });
}
