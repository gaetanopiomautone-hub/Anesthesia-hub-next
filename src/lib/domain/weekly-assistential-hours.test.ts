import { describe, expect, it } from "vitest";

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

import {
  ASSISTENTIAL_HALF_DAY_HOURS,
  assistentialHalfDayUnits,
  buildWeeklyAssistentialLoads,
  weekRangeMondaySunday,
  WEEKLY_ASSISTENTIAL_CAP_HOURS,
} from "./weekly-assistential-hours";

function sala(overrides: Partial<ShiftItemRow>): ShiftItemRow {
  return {
    id: overrides.id ?? "shift-default-id",
    plan_id: "p1",
    shift_date: overrides.shift_date ?? "2026-05-11",
    kind: "sala",
    period: overrides.period ?? "mattina",
    start_time: null,
    end_time: null,
    label: "Sala base",
    room_name: "Sala Orto",
    specialty: "Sala base",
    clinical_area_id: null,
    clinical_area: null,
    assignment_location_id: null,
    assignment_location: null,
    notes: null,
    source: "manual",
    assigned_to: overrides.assigned_to ?? "user-1",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as ShiftItemRow;
}

function reper(overrides: Partial<ShiftItemRow>): ShiftItemRow {
  return sala({
    kind: "reperibilita",
    period: "reperibilita",
    label: "Reper",
    ...overrides,
  });
}

describe("weekRangeMondaySunday", () => {
  it("usa lunedì–domenica ISO (lun 11 mag 2026)", () => {
    const { weekStart, weekEnd } = weekRangeMondaySunday("2026-05-11");
    expect(weekStart).toBe("2026-05-11");
    expect(weekEnd).toBe("2026-05-17");
  });

  it("domenica appartiene alla settimana che inizia il lun precedente", () => {
    const { weekStart, weekEnd } = weekRangeMondaySunday("2026-05-17");
    expect(weekStart).toBe("2026-05-11");
    expect(weekEnd).toBe("2026-05-17");
  });
});

describe("assistentialHalfDayUnits", () => {
  it("reper = 0", () => {
    expect(assistentialHalfDayUnits(reper({}))).toBe(0);
  });

  it("sala mattina/pomeriggio = 1; giornata = 2", () => {
    expect(assistentialHalfDayUnits(sala({ period: "mattina" }))).toBe(1);
    expect(assistentialHalfDayUnits(sala({ period: "pomeriggio" }))).toBe(1);
    expect(assistentialHalfDayUnits(sala({ period: "giornata" }))).toBe(2);
  });

  it("ambulatorio giornata = 2", () => {
    const amb = sala({ kind: "ambulatorio", period: "giornata", label: "Amb" });
    expect(assistentialHalfDayUnits(amb)).toBe(2);
  });
});

describe("buildWeeklyAssistentialLoads", () => {
  const name = (id: string) => (id === "user-1" ? "Mario Rossi" : id);

  it("6 mezze giornate nella stessa settimana = 36h, non exceeded", () => {
    const items: ShiftItemRow[] = Array.from({ length: 6 }, (_, i) =>
      sala({
        id: `s${i}`,
        shift_date: `2026-05-${11 + i}`,
        assigned_to: "user-1",
      }),
    );
    const loads = buildWeeklyAssistentialLoads(items, name);
    const weekLoads = loads.filter((l) => l.weekStart === "2026-05-11");
    expect(weekLoads).toHaveLength(1);
    expect(weekLoads[0]!.assistentialHalfDays).toBe(6);
    expect(weekLoads[0]!.assistentialHours).toBe(6 * ASSISTENTIAL_HALF_DAY_HOURS);
    expect(weekLoads[0]!.exceeded).toBe(false);
    expect(weekLoads[0]!.contributingShifts).toHaveLength(6);
  });

  it("7 mezze giornate nella stessa settimana = 42h > 36", () => {
    const items: ShiftItemRow[] = Array.from({ length: 7 }, (_, i) =>
      sala({
        id: `s${i}`,
        shift_date: `2026-05-${11 + i}`,
        assigned_to: "user-1",
      }),
    );
    const loads = buildWeeklyAssistentialLoads(items, name);
    const w = loads.find((l) => l.weekStart === "2026-05-11");
    expect(w?.assistentialHours).toBe(7 * ASSISTENTIAL_HALF_DAY_HOURS);
    expect(w?.exceeded).toBe(true);
    expect(w?.assistentialHours).toBeGreaterThan(WEEKLY_ASSISTENTIAL_CAP_HOURS);
  });

  it("reperibilità non aumenta le ore assistenziali", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) =>
        sala({ id: `s${i}`, shift_date: `2026-05-${11 + i}`, assigned_to: "user-1" }),
      ),
      reper({ id: "r1", shift_date: "2026-05-12", assigned_to: "user-1" }),
    ];
    const loads = buildWeeklyAssistentialLoads(items, name);
    const w = loads.find((l) => l.weekStart === "2026-05-11");
    expect(w?.assistentialHours).toBe(36);
    expect(w?.reperCount).toBe(1);
    expect(w?.exceeded).toBe(false);
  });

  it("settimane diverse per date oltre domenica", () => {
    const items = [
      sala({ id: "a", shift_date: "2026-05-17", assigned_to: "user-1" }),
      sala({ id: "b", shift_date: "2026-05-18", assigned_to: "user-1" }),
    ];
    const loads = buildWeeklyAssistentialLoads(items, name);
    const starts = new Set(loads.map((l) => l.weekStart));
    expect(starts.has("2026-05-11")).toBe(true);
    expect(starts.has("2026-05-18")).toBe(true);
  });
});
