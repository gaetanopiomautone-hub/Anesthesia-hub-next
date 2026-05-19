import { describe, expect, it } from "vitest";

import {
  mapLeaveRequestFromDb,
  mapLeaveRequestToDbCancel,
  mapLeaveRequestToDbInsert,
  mapLeaveRequestToDbReview,
  mapLeaveStatusFromDb,
  mapLeaveTypeToDb,
} from "@/lib/domain/leave-request-db";

describe("leave-request-db", () => {
  it("maps Postgres row to app model", () => {
    const row = mapLeaveRequestFromDb({
      id: "lr-1",
      user_id: "user-1",
      request_type: "ferie",
      start_date: "2026-05-11",
      end_date: "2026-05-15",
      status: "in_attesa",
      reason: "test",
      reviewed_by: null,
      reviewed_at: null,
      cancelled_at: null,
    });

    expect(row.user_id).toBe("user-1");
    expect(row.request_type).toBe("vacation");
    expect(row.status).toBe("pending");
    expect(row.reason).toBe("test");
  });

  it("maps app insert payload to Postgres columns", () => {
    expect(
      mapLeaveRequestToDbInsert({
        userId: "user-1",
        requestType: "vacation",
        startDate: "2026-05-01",
        endDate: "2026-05-03",
        reason: "ferie",
      }),
    ).toEqual({
      user_id: "user-1",
      request_type: "ferie",
      start_date: "2026-05-01",
      end_date: "2026-05-03",
      status: "in_attesa",
      reason: "ferie",
      reviewed_by: null,
      reviewed_at: null,
      cancelled_at: null,
    });
  });

  it("maps status and request type enums", () => {
    expect(mapLeaveStatusFromDb("approvato")).toBe("approved");
    expect(mapLeaveTypeToDb("permission")).toBe("desiderata");
  });

  it("maps cancel payload with cancelled_at", () => {
    expect(mapLeaveRequestToDbCancel("2026-07-15T10:00:00.000Z")).toEqual({
      status: "annullato",
      reviewed_by: null,
      reviewed_at: null,
      cancelled_at: "2026-07-15T10:00:00.000Z",
    });
  });

  it("maps review payload with reviewed_by/at and reason", () => {
    expect(
      mapLeaveRequestToDbReview({
        reviewerId: "admin-1",
        status: "approvato",
        reason: "ok",
      }),
    ).toMatchObject({
      status: "approvato",
      reviewed_by: "admin-1",
      reason: "ok",
    });
  });

  it("maps cancelled_at from DB row", () => {
    const row = mapLeaveRequestFromDb({
      id: "lr-1",
      user_id: "user-1",
      request_type: "ferie",
      start_date: "2026-07-15",
      end_date: "2026-07-15",
      status: "annullato",
      reason: null,
      reviewed_by: null,
      reviewed_at: null,
      cancelled_at: "2026-07-15T12:00:00.000Z",
    });
    expect(row.status).toBe("cancelled");
    expect(row.cancelled_at).toBe("2026-07-15T12:00:00.000Z");
  });
});
