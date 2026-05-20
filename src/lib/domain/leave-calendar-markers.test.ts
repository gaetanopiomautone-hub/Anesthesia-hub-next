import { describe, expect, it } from "vitest";

import {
  buildCalendarMarkersForDay,
  leaveRequestTypeToCalendarKind,
  planningBlockKindToCalendarKind,
} from "@/lib/domain/leave-calendar-markers";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";

function leave(partial: Partial<LeaveRequestRow> & Pick<LeaveRequestRow, "id" | "start_date" | "end_date">): LeaveRequestRow {
  return {
    user_id: "u1",
    request_type: "vacation",
    status: "pending",
    reason: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    cancelled_at: null,
    created_at: "",
    ...partial,
  };
}

describe("leave-calendar-markers", () => {
  it("maps leave types to calendar kinds", () => {
    expect(leaveRequestTypeToCalendarKind("vacation")).toBe("leave");
    expect(leaveRequestTypeToCalendarKind("conference")).toBe("congress");
    expect(planningBlockKindToCalendarKind("didattica")).toBe("lesson");
    expect(planningBlockKindToCalendarKind("congresso")).toBe("congress");
  });

  it("builds leave + congress + lesson markers for a day", () => {
    const markers = buildCalendarMarkersForDay({
      ymd: "2026-07-15",
      leaves: [
        leave({ id: "l1", start_date: "2026-07-10", end_date: "2026-07-20", status: "approved" }),
        leave({ id: "l2", start_date: "2026-07-15", end_date: "2026-07-15", request_type: "conference", status: "pending" }),
      ],
      blocks: [{ id: "b1", blockDate: "2026-07-15", kind: "didattica", title: "ECM" }],
    });

    expect(markers).toHaveLength(3);
    const leaveMarker = markers.find((m) => m.kind === "leave");
    expect(leaveMarker?.kind).toBe("leave");
    if (leaveMarker?.kind === "leave") expect(leaveMarker.status).toBe("approved");
    expect(markers.some((m) => m.kind === "congress")).toBe(true);
    expect(markers.some((m) => m.kind === "lesson")).toBe(true);
  });
});
