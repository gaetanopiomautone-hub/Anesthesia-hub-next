import { describe, expect, it } from "vitest";

import type { PlanningAssistentialConflict } from "@/lib/domain/planning-assistential-conflicts";
import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";
import type { WeeklyAssistentialLoadRow } from "@/lib/domain/weekly-assistential-hours";

import {
  buildMonthlyTraineeShiftStatistics,
  collectTraineeIdsWithAssignmentsInMonth,
  conflictCountForTrainee,
  weekendWorkedDaysInMonthForUser,
} from "./monthly-trainee-shift-statistics";

function baseItem(overrides: Partial<ShiftItemRow>): ShiftItemRow {
  return {
    id: "1",
    plan_id: "p",
    shift_date: "2026-05-11",
    kind: "sala",
    period: "mattina",
    start_time: null,
    end_time: null,
    label: "Sala",
    room_name: "Sala Orto",
    specialty: null,
    clinical_area_id: null,
    clinical_area: null,
    assignment_location_id: "loc-orto",
    assignment_location: { id: "loc-orto", name: "Sala Orto", kind: "sala", is_active: true },
    notes: null,
    source: "manual",
    assigned_to: "u1",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as ShiftItemRow;
}

describe("buildMonthlyTraineeShiftStatistics", () => {
  const monthStart = "2026-05-01";
  const monthEnd = "2026-05-31";
  const name = (id: string) => (id === "u1" ? "Rossi" : id);

  it("4 mattine + 2 pomeriggi = 36h e conteggio turni", () => {
    const items: ShiftItemRow[] = [];
    for (let i = 0; i < 4; i++) {
      items.push(
        baseItem({
          id: `m${i}`,
          shift_date: `2026-05-${10 + i}`,
          period: "mattina",
        }),
      );
    }
    for (let i = 0; i < 2; i++) {
      items.push(
        baseItem({
          id: `p${i}`,
          shift_date: `2026-05-${20 + i}`,
          period: "pomeriggio",
        }),
      );
    }
    const rows = buildMonthlyTraineeShiftStatistics({
      items,
      monthStart,
      monthEnd,
      conflicts: [],
      weeklyLoads: [],
      userIds: ["u1"],
      nameById: name,
    });
    expect(rows[0]!.assistentialHalfDays).toBe(6);
    expect(rows[0]!.assistentialHoursMonth).toBe(36);
    expect(rows[0]!.morningShifts).toBe(4);
    expect(rows[0]!.afternoonShifts).toBe(2);
    expect(rows[0]!.reperShifts).toBe(0);
  });

  it("reper non aumenta ore ma incrementa reper", () => {
    const items = [
      baseItem({ id: "a", period: "mattina" }),
      baseItem({
        id: "r",
        kind: "reperibilita",
        period: "reperibilita",
        shift_date: "2026-05-12",
      }),
    ];
    const rows = buildMonthlyTraineeShiftStatistics({
      items,
      monthStart,
      monthEnd,
      conflicts: [],
      weeklyLoads: [],
      userIds: ["u1"],
      nameById: name,
    });
    expect(rows[0]!.assistentialHoursMonth).toBe(6);
    expect(rows[0]!.reperShifts).toBe(1);
  });

  it("giornata = 12h (2 mezze)", () => {
    const items = [baseItem({ id: "g", period: "giornata" })];
    const rows = buildMonthlyTraineeShiftStatistics({
      items,
      monthStart,
      monthEnd,
      conflicts: [],
      weeklyLoads: [],
      userIds: ["u1"],
      nameById: name,
    });
    expect(rows[0]!.assistentialHoursMonth).toBe(12);
    expect(rows[0]!.fullDayShifts).toBe(1);
  });

  it("sabato turno + domenica reper → 2 giorni weekend", () => {
    const items = [
      baseItem({ id: "s", shift_date: "2026-05-09", period: "mattina" }),
      baseItem({
        id: "d",
        shift_date: "2026-05-10",
        kind: "reperibilita",
        period: "reperibilita",
      }),
    ];
    expect(weekendWorkedDaysInMonthForUser(items, "u1", monthStart, monthEnd)).toBe(2);
  });

  it("distribuzione per sala: 5 mattine Sala Orto → 5 mezze", () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      baseItem({
        id: `x${i}`,
        shift_date: `2026-05-${String(i + 1).padStart(2, "0")}`,
        period: "mattina",
      }),
    );
    const rows = buildMonthlyTraineeShiftStatistics({
      items,
      monthStart,
      monthEnd,
      conflicts: [],
      weeklyLoads: [],
      userIds: ["u1"],
      nameById: name,
    });
    const orto = rows[0]!.locationHalfDays.find((l) => l.locationLabel === "Sala Orto");
    expect(orto?.halfDays).toBe(5);
  });

  it("conflitti conteggiati per specializzando", () => {
    const conflicts: PlanningAssistentialConflict[] = [
      {
        shiftItemId: "a",
        shiftDate: "2026-05-11",
        assigneeId: "u1",
        assigneeName: "Rossi",
        shiftKindLabel: "Sala",
        shiftPeriodLabel: "Mattina",
        locationLabel: "Orto",
        activityKind: "ferie",
        activityLabel: "ferie",
        activityPeriodLabel: "tutto il giorno",
        shortMessage: "Conflitto: ferie",
      },
    ];
    expect(conflictCountForTrainee(conflicts, "u1")).toBe(1);
    const rows = buildMonthlyTraineeShiftStatistics({
      items: [baseItem({ id: "a" })],
      monthStart,
      monthEnd,
      conflicts,
      weeklyLoads: [],
      userIds: ["u1"],
      nameById: name,
    });
    expect(rows[0]!.conflictsCount).toBe(1);
  });

  it("settimane oltre 36h", () => {
    const loads: WeeklyAssistentialLoadRow[] = [
      {
        userId: "u1",
        displayName: "Rossi",
        weekStart: "2026-05-04",
        weekEnd: "2026-05-10",
        assistentialHalfDays: 7,
        assistentialHours: 42,
        reperCount: 0,
        exceeded: true,
        contributingShifts: [],
      },
    ];
    const rows = buildMonthlyTraineeShiftStatistics({
      items: [],
      monthStart,
      monthEnd,
      conflicts: [],
      weeklyLoads: loads,
      userIds: ["u1"],
      nameById: name,
    });
    expect(rows[0]!.weeksOver36HoursCount).toBe(1);
  });
});

describe("collectTraineeIdsWithAssignmentsInMonth", () => {
  it("rispetta preferredOrder", () => {
    const ids = collectTraineeIdsWithAssignmentsInMonth(
      [
        baseItem({ assigned_to: "b", shift_date: "2026-05-02" }),
        baseItem({ assigned_to: "a", shift_date: "2026-05-03" }),
      ],
      "2026-05-01",
      "2026-05-31",
      ["a", "b", "c"],
    );
    expect(ids).toEqual(["a", "b"]);
  });
});
