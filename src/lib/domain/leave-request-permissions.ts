import type { AppRole } from "@/lib/auth/roles";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";

type PermissionContext = {
  request: LeaveRequestRow;
  currentUserId: string;
  currentUserRole: AppRole;
};

export function canEditLeaveRequest({ request, currentUserId, currentUserRole }: PermissionContext) {
  return currentUserRole === "specializzando" && request.user_id === currentUserId && request.status === "pending";
}

export function canCancelLeaveRequest({ request, currentUserId, currentUserRole }: PermissionContext) {
  return currentUserRole === "specializzando" && request.user_id === currentUserId && request.status === "pending";
}

export function canReviewLeaveRequest({ request, currentUserId, currentUserRole }: PermissionContext) {
  return (currentUserRole === "tutor" || currentUserRole === "admin") && request.status === "pending" && request.user_id !== currentUserId;
}
