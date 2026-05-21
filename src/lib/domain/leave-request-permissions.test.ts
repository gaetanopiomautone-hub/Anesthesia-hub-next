import { describe, expect, it } from "vitest";

import { canCancelLeaveRequest } from "@/lib/domain/leave-request-permissions";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";

function request(partial: Partial<LeaveRequestRow> & Pick<LeaveRequestRow, "status" | "user_id">): LeaveRequestRow {
  return {
    id: "r1",
    request_type: "vacation",
    start_date: "2026-05-01",
    end_date: "2026-05-03",
    reason: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    cancelled_at: null,
    created_at: "",
    ...partial,
  };
}

describe("leave-request-permissions", () => {
  it("allows trainee to cancel own pending only", () => {
    expect(
      canCancelLeaveRequest({
        request: request({ user_id: "u1", status: "pending" }),
        currentUserId: "u1",
        currentUserRole: "specializzando",
      }),
    ).toBe(true);
    expect(
      canCancelLeaveRequest({
        request: request({ user_id: "u1", status: "approved" }),
        currentUserId: "u1",
        currentUserRole: "specializzando",
      }),
    ).toBe(false);
  });

  it("allows tutor/admin to cancel pending or approved", () => {
    expect(
      canCancelLeaveRequest({
        request: request({ user_id: "u2", status: "approved" }),
        currentUserId: "admin-1",
        currentUserRole: "admin",
      }),
    ).toBe(true);
    expect(
      canCancelLeaveRequest({
        request: request({ user_id: "u2", status: "rejected" }),
        currentUserId: "admin-1",
        currentUserRole: "tutor",
      }),
    ).toBe(false);
  });
});
