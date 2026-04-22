import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";
export type { LeaveRequestRow, LeaveRequestStatus, LeaveRequestType } from "@/lib/domain/leave-request-shared";
export { formatDateItalian, leaveStatusLabelItalian, leaveTypeLabelItalian } from "@/lib/domain/leave-request-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
