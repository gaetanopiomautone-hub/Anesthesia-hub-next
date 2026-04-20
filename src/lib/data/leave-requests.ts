import { format } from "date-fns";
import { it } from "date-fns/locale";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveRequestType =
  | "vacation"
  | "permission"
  | "sick_leave"
  | "conference"
  | "other";

export type LeaveRequestRow = {
  id: string;
  user_id: string;
  request_type: LeaveRequestType;
  start_date: string;
  end_date: string;
  status: LeaveRequestStatus;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  requester?: { full_name: string | null; email: string | null } | null;
  approver?: { full_name: string | null; email: string | null } | null;
};

export function leaveStatusLabelItalian(status: LeaveRequestStatus) {
  switch (status) {
    case "pending":
      return "In attesa";
    case "approved":
      return "Approvata";
    case "rejected":
      return "Rifiutata";
    case "cancelled":
      return "Annullata";
  }
}

export function leaveTypeLabelItalian(type: LeaveRequestType) {
  switch (type) {
    case "vacation":
      return "Ferie";
    case "permission":
      return "Permesso";
    case "sick_leave":
      return "Malattia";
    case "conference":
      return "Congresso";
    case "other":
      return "Altro";
  }
}

export function formatDateItalian(value: string) {
  return format(new Date(value), "dd/MM/yyyy", { locale: it });
}

export async function listLeaveRequests(profile: CurrentUserProfile) {
  const supabase = await createServerSupabaseClient();

  const query = supabase
    .from("leave_requests")
    .select("*")
    .limit(10);

  if (profile.role === "specializzando") {
    query.eq("user_id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as LeaveRequestRow[];
}
