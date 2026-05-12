import { describe, expect, it } from "vitest";

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

import {
  buildPlanningAssistentialConflicts,
  dayPeriodsOverlap,
  shiftDateInInclusiveLeaveRange,
  shiftItemAssistentialDayPeriod,
} from "./planning-assistential-conflicts";

describe("dayPeriodsOverlap", () => {
  it("full_day confligge con mattina e pomeriggio", () => {
    expect(dayPeriodsOverlap("full_day", "morning")).toBe(true);
    expect(dayPeriodsOverlap("morning", "full_day")).toBe(true);
    expect(dayPeriodsOverlap("full_day", "afternoon")).toBe(true);
  });

  it("mattina confligge solo con mattina", () => {
    expect(dayPeriodsOverlap("morning", "morning")).toBe(true);
    expect(dayPeriodsOverlap("morning", "afternoon")).toBe(false);
  });

  it("pomeriggio confligge solo con pomeriggio", () => {
    expect(dayPeriodsOverlap("afternoon", "afternoon")).toBe(true);
    expect(dayPeriodsOverlap("afternoon", "morning")).toBe(false);
  });
});

describe("shiftDateInInclusiveLeaveRange", () => {
  it("include estremi", () => {
    expect(shiftDateInInclusiveLeaveRange("2026-05-11", "2026-05-11", "2026-05-15")).toBe(true);
    expect(shiftDateInInclusiveLeaveRange("2026-05-15", "2026-05-11", "2026-05-15")).toBe(true);
    expect(shiftDateInInclusiveLeaveRange("2026-05-10", "2026-05-11", "2026-05-15")).toBe(false);
  });
});

function baseItem(overrides: Partial<ShiftItemRow>): ShiftItemRow {
  return {
    id: "shift-1",
    plan_id: "p1",
    shift_date: "2026-05-11",
    kind: "sala",
    period: "mattina",
    start_time: null,
    end_time: null,
    label: "Sala base",
    room_name: "Sala Orto",
    specialty: null,
    clinical_area_id: null,
    clinical_area: null,
    assignment_location_id: null,
    assignment_location: null,
    notes: null,
    source: "manual",
    assigned_to: "user-1",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as ShiftItemRow;
}

describe("buildPlanningAssistentialConflicts", () => {
  const name = (id: string) => (id === "user-1" ? "Rossi" : id);

  it("blocco congresso full_day contro sala mattina e pomeriggio", () => {
    const blocks = [
      {
        id: "b1",
        userId: "user-1",
        blockDate: "2026-05-11",
        period: "full_day" as const,
        kind: "congresso",
        title: "SIAARTI",
        note: null,
      },
    ];
    const mattina = baseItem({ id: "s1", period: "mattina" });
    const pomeriggio = baseItem({ id: "s2", period: "pomeriggio", shift_date: "2026-05-11" });
    const c = buildPlanningAssistentialConflicts({
      items: [mattina, pomeriggio],
      leaves: [],
      blocks,
      nameById: name,
    });
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.shortMessage.toLowerCase().includes("congresso"))).toBe(true);
  });

  it("ferie full_day contro sala mattina e pomeriggio", () => {
    const leaves = [
      {
        id: "l1",
        userId: "user-1",
        requestType: "ferie",
        startDate: "2026-05-11",
        endDate: "2026-05-11",
        status: "approved",
        note: null,
      },
    ];
    const mattina = baseItem({ id: "s1", period: "mattina" });
    const pomeriggio = baseItem({ id: "s2", period: "pomeriggio", shift_date: "2026-05-11" });
    const c = buildPlanningAssistentialConflicts({
      items: [mattina, pomeriggio],
      leaves,
      blocks: [],
      nameById: name,
    });
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.shortMessage.includes("ferie"))).toBe(true);
  });

  it("lezione solo pomeriggio: mattina ok, pomeriggio conflitto", () => {
    const blocks = [
      {
        id: "b1",
        userId: "user-1",
        blockDate: "2026-05-11",
        period: "afternoon" as const,
        kind: "didattica",
        title: "Lezione ECM",
        note: null,
      },
    ];
    const mattina = baseItem({ id: "s1", period: "mattina" });
    const pomeriggio = baseItem({ id: "s2", period: "pomeriggio" });
    const c = buildPlanningAssistentialConflicts({
      items: [mattina, pomeriggio],
      leaves: [],
      blocks,
      nameById: name,
    });
    expect(c).toHaveLength(1);
    expect(c[0]!.shiftItemId).toBe("s2");
    expect(c[0]!.shortMessage).toMatch(/lezione/i);
  });

  it("reperibilità non genera conflitto con blocchi", () => {
    const blocks = [
      {
        id: "b1",
        userId: "user-1",
        blockDate: "2026-05-11",
        period: "full_day" as const,
        kind: "congresso",
        title: "Congresso",
        note: null,
      },
    ];
    const reper = baseItem({
      id: "r1",
      kind: "reperibilita",
      period: "reperibilita",
    });
    const c = buildPlanningAssistentialConflicts({
      items: [reper],
      leaves: [],
      blocks,
      nameById: name,
    });
    expect(c).toHaveLength(0);
  });

  it("shiftItemAssistentialDayPeriod: reper è null", () => {
    expect(
      shiftItemAssistentialDayPeriod(
        baseItem({ kind: "reperibilita", period: "reperibilita" }),
      ),
    ).toBeNull();
  });
});
