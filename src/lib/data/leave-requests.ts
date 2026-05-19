import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";
export type { LeaveRequestRow, LeaveRequestStatus, LeaveRequestType } from "@/lib/domain/leave-request-shared";
export { formatDateItalian, leaveStatusLabelItalian, leaveTypeLabelItalian } from "@/lib/domain/leave-request-shared";
import { mapLeaveRequestFromDb } from "@/lib/domain/leave-request-db";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const LEAVE_SELECT =
  "id, user_id, request_type, start_date, end_date, status, note, reviewed_by, reviewed_at, cancelled_at, created_at";

export async function listLeaveRequests(profile: CurrentUserProfile) {
  const supabase = await createServerSupabaseClient();

  let query = supabase.from("leave_requests").select(LEAVE_SELECT).order("created_at", { ascending: false }).limit(50);

  if (profile.role === "specializzando") {
    query = query.eq("user_id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapLeaveRequestFromDb(row as Record<string, unknown>));
}
