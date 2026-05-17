import { describe, expect, it } from "vitest";

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

import {
  buildCalendarWeeksForMonth,
  buildMonthlyPlanDaySummaries,
} from "./monthly-plan-day-summary";

function row(partial: Partial<ShiftItemRow> & Pick<ShiftItemRow, "id" | "shift_date" | "kind">): ShiftItemRow {
  return {
    plan_id: "p1",
    period: "mattina",
    start_time: null,
    end_time: null,
    label: "Test",
    room_name: null,
    specialty: null,
    clinical_area_id: null,
    clinical_area: null,
    assignment_location_id: null,
    assignment_location: null,
    notes: null,
    source: "manual",
    assigned_to: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("buildMonthlyPlanDaySummaries", () => {
  it("calcola sintesi sala e stato parziale", () => {
    const items = [
      row({ id: "1", shift_date: "2026-05-12", kind: "sala", period: "mattina", assigned_to: "u1" }),
      row({ id: "2", shift_date: "2026-05-12", kind: "sala", period: "pomeriggio" }),
      row({ id: "3", shift_date: "2026-05-12", kind: "reperibilita", period: "reperibilita", assigned_to: "u2" }),
    ];
    const map = buildMonthlyPlanDaySummaries({
      items,
      monthStart: "2026-05-01",
      monthEnd: "2026-05-31",
      conflicts: [],
      weeklyExcessUserIds: new Set(),
    });
    const s = map.get("2026-05-12");
    expect(s?.salaTotal).toBe(2);
    expect(s?.salaAssigned).toBe(1);
    expect(s?.reperTotal).toBe(1);
    expect(s?.assignedCount).toBe(2);
    expect(s?.totalSlots).toBe(3);
    expect(s?.fillStatus).toBe("partial");
  });

  it("segna conflitto quando presente", () => {
    const items = [row({ id: "1", shift_date: "2026-05-12", kind: "sala", assigned_to: "u1" })];
    const map = buildMonthlyPlanDaySummaries({
      items,
      monthStart: "2026-05-01",
      monthEnd: "2026-05-31",
      conflicts: [
        {
          shiftItemId: "1",
          shiftDate: "2026-05-12",
          assigneeId: "u1",
          assigneeName: "A",
          shiftKindLabel: "sala",
          shiftPeriodLabel: "mattina",
          locationLabel: "X",
          activityKind: "ferie",
          activityLabel: "Ferie",
          activityPeriodLabel: "tutto il giorno",
          shortMessage: "Conflitto",
        },
      ],
      weeklyExcessUserIds: new Set(),
    });
    expect(map.get("2026-05-12")?.fillStatus).toBe("conflict");
    expect(map.get("2026-05-12")?.conflictCount).toBe(1);
  });
});

describe("buildCalendarWeeksForMonth", () => {
  it("produce settimane lun–dom", () => {
    const weeks = buildCalendarWeeksForMonth(new Date(2026, 4, 1));
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    expect(weeks[0]?.length).toBe(7);
  });
});
