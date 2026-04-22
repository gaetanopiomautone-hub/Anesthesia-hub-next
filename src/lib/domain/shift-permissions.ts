import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { normalizeShiftStatus, type ShiftStatus } from "@/lib/domain/shift-shared";

export function canAssignShifts(user: Pick<CurrentUserProfile, "role">) {
  return user.role === "admin";
}

export function canViewAllShifts(user: Pick<CurrentUserProfile, "role">) {
  return user.role === "admin" || user.role === "tutor";
}

export function canProposeShifts(user: Pick<CurrentUserProfile, "role">) {
  return user.role === "admin" || user.role === "specializzando";
}

export function canApproveShifts(user: Pick<CurrentUserProfile, "role">) {
  return user.role === "admin";
}

export function canEditShiftProposal(params: {
  user: Pick<CurrentUserProfile, "id" | "role">;
  shift: { status?: ShiftStatus | null; proposed_by?: string | null } | null;
}) {
  const { user, shift } = params;
  if (!shift) return false;
  if (user.role === "admin") return true;
  if (user.role !== "specializzando") return false;
  if (normalizeShiftStatus(shift.status) === "approved") return false;

  const proposedBy = String(shift.proposed_by ?? "").trim();
  if (!proposedBy) return true;
  return proposedBy === user.id;
}
