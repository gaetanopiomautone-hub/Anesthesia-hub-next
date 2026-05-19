import { describe, expect, it, vi } from "vitest";

import {
  ACTIVE_LEAVE_OVERLAP_DB_STATUSES,
  activeLeaveRangesOverlap,
  assertValidLeaveDateRange,
  findOverlappingActiveLeaveRequest,
  hasActiveLeaveOverlap,
  LeaveDateRangeError,
} from "@/lib/data/leave-request-overlap";

describe("leave-request-overlap", () => {
  it("ACTIVE_LEAVE_OVERLAP_DB_STATUSES includes only blocking states", () => {
    expect(ACTIVE_LEAVE_OVERLAP_DB_STATUSES).toEqual(["in_attesa", "approvato"]);
    expect(ACTIVE_LEAVE_OVERLAP_DB_STATUSES).not.toContain("annullato");
    expect(ACTIVE_LEAVE_OVERLAP_DB_STATUSES).not.toContain("rifiutato");
  });

  it("assertValidLeaveDateRange rejects inverted range", () => {
    expect(() => assertValidLeaveDateRange("2026-07-20", "2026-07-10")).toThrow(LeaveDateRangeError);
  });

  it("activeLeaveRangesOverlap matches interval semantics", () => {
    expect(activeLeaveRangesOverlap("2026-07-15", "2026-07-15", "2026-07-11", "2026-07-15")).toBe(true);
    expect(activeLeaveRangesOverlap("2026-07-16", "2026-07-20", "2026-07-11", "2026-07-15")).toBe(false);
    expect(activeLeaveRangesOverlap("2026-07-16", "2026-07-16", "2026-07-15", "2026-07-17")).toBe(true);
  });

  it("findOverlappingActiveLeaveRequest builds expected filters", async () => {
    const overlapResult = { data: [{ id: "lr-99" }], error: null };
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      then: (resolve: (v: typeof overlapResult) => unknown) => Promise.resolve(overlapResult).then(resolve),
    };

    const supabase = {
      from: vi.fn().mockReturnValue(chain),
    };

    const result = await findOverlappingActiveLeaveRequest(supabase as never, {
      userId: "user-1",
      startDate: "2026-07-15",
      endDate: "2026-07-15",
      excludeRequestId: "lr-self",
    });

    expect(supabase.from).toHaveBeenCalledWith("leave_requests");
    expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(chain.in).toHaveBeenCalledWith("status", ["in_attesa", "approvato"]);
    expect(chain.lte).toHaveBeenCalledWith("start_date", "2026-07-15");
    expect(chain.gte).toHaveBeenCalledWith("end_date", "2026-07-15");
    expect(chain.neq).toHaveBeenCalledWith("id", "lr-self");
    expect(hasActiveLeaveOverlap(result)).toBe(true);
    expect(result.overlappingId).toBe("lr-99");
  });
});
