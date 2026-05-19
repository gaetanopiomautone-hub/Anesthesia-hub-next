import { describe, expect, it } from "vitest";

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

import { buildPlanningAssistentialConflicts } from "./planning-assistential-conflicts";
import {
  buildTraineeWeeklyPlanningSummaries,
  collectTraineeWeeklySummaryUserIds,
} from "./trainee-weekly-planning-summary";

function baseShift(overrides: Partial<ShiftItemRow>): ShiftItemRow {
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

describe("buildTraineeWeeklyPlanningSummaries", () => {
  const monthStart = "2026-05-01";
  const monthEnd = "2026-05-31";
  const name = (id: string) => (id === "user-1" ? "Rossi" : id);

  it("sala mattina + sala pomeriggio stesso giorno = 12h assistenziali", () => {
    const area = { id: "area-orto", code: "ORTO", name: "Ortopedia", is_active: true };
    const items = [
      baseShift({
        id: "s1",
        period: "mattina",
        clinical_area_id: area.id,
        clinical_area: area,
        room_name: "Sala 2",
      }),
      baseShift({
        id: "s2",
        period: "pomeriggio",
        clinical_area_id: area.id,
        clinical_area: area,
        room_name: "Sala 2",
      }),
    ];
    const rows = buildTraineeWeeklyPlanningSummaries({
      items,
      leaves: [],
      blocks: [],
      conflicts: [],
      nameById: name,
      monthStart,
      monthEnd,
      userIds: ["user-1"],
    });
    const day = rows[0]!.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-05-11");
    expect(day?.assistentialDayHours).toBe(12);
    expect(day?.morningItems[0]?.locationLabel).toBe("Ortopedia · Sala 2");
    expect(day?.morningItems[0]?.locationPrimary).toBe("Ortopedia");
    expect(day?.morningItems[0]?.locationSecondary).toBe("Sala 2");
    expect(day?.afternoonItems[0]?.locationLabel).toBe("Ortopedia · Sala 2");
  });

  it("senza area clinica usa solo room_name in locationLabel", () => {
    const items = [baseShift({ id: "s1", room_name: "Sala Orto" })];
    const rows = buildTraineeWeeklyPlanningSummaries({
      items,
      leaves: [],
      blocks: [],
      conflicts: [],
      nameById: name,
      monthStart,
      monthEnd,
      userIds: ["user-1"],
    });
    const day = rows[0]!.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-05-11");
    expect(day?.morningItems[0]?.locationLabel).toBe("Sala Orto");
  });

  it("lezione pomeriggio non conta ore; mattina sala sì", () => {
    const items = [baseShift({ id: "s1", period: "mattina" })];
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
    const rows = buildTraineeWeeklyPlanningSummaries({
      items,
      leaves: [],
      blocks,
      conflicts: [],
      nameById: name,
      monthStart,
      monthEnd,
      userIds: ["user-1"],
    });
    const day = rows[0]!.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-05-11");
    expect(day?.assistentialDayHours).toBe(6);
    expect(day?.afternoonItems.some((e) => e.category === "didattica")).toBe(true);
  });

  it("congresso full_day in fullDayItems, 0h assistenziali", () => {
    const items: ShiftItemRow[] = [];
    const blocks = [
      {
        id: "b1",
        userId: "user-1",
        blockDate: "2026-05-15",
        period: "full_day" as const,
        kind: "congresso",
        title: "SIAARTI",
        note: null,
      },
    ];
    const rows = buildTraineeWeeklyPlanningSummaries({
      items,
      leaves: [],
      blocks,
      conflicts: [],
      nameById: name,
      monthStart,
      monthEnd,
      userIds: ["user-1"],
    });
    const day = rows[0]!.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-05-15");
    expect(day?.assistentialDayHours).toBe(0);
    expect(day?.fullDayItems.some((e) => e.category === "congresso")).toBe(true);
    expect(day?.morningItems.length).toBe(0);
    expect(day?.afternoonItems.length).toBe(0);
  });

  it("reperibilità in reperItems, non nelle ore assistenziali", () => {
    const items = [
      baseShift({
        id: "r1",
        kind: "reperibilita",
        period: "reperibilita",
        shift_date: "2026-05-16",
      }),
    ];
    const rows = buildTraineeWeeklyPlanningSummaries({
      items,
      leaves: [],
      blocks: [],
      conflicts: [],
      nameById: name,
      monthStart,
      monthEnd,
      userIds: ["user-1"],
    });
    const day = rows[0]!.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-05-16");
    expect(day?.assistentialDayHours).toBe(0);
    expect(day?.reperItems).toHaveLength(1);
    const week = rows[0]!.weeks.find((w) => w.days.some((d) => d.date === "2026-05-16"));
    expect(week?.reperCount).toBeGreaterThanOrEqual(1);
  });

  it("7 mezze giornate assistenziali nella stessa settimana → exceededWeeklyCap", () => {
    const items: ShiftItemRow[] = [];
    for (let i = 0; i < 7; i++) {
      const d = `2026-05-${11 + i}`;
      items.push(
        baseShift({
          id: `m-${i}`,
          shift_date: d,
          period: "mattina",
        }),
      );
      items.push(
        baseShift({
          id: `p-${i}`,
          shift_date: d,
          period: "pomeriggio",
        }),
      );
    }
    const rows = buildTraineeWeeklyPlanningSummaries({
      items,
      leaves: [],
      blocks: [],
      conflicts: [],
      nameById: name,
      monthStart,
      monthEnd,
      userIds: ["user-1"],
    });
    const week = rows[0]!.weeks.find((w) => w.weekStart <= "2026-05-11" && w.weekEnd >= "2026-05-11");
    expect(week?.totalAssistentialHours).toBe(7 * 12);
    expect(week?.exceededWeeklyCap).toBe(true);
  });

  it("conflitto turno mattina + ferie full_day compare tra conflictMessages del giorno", () => {
    const items = [baseShift({ id: "s1", period: "mattina", shift_date: "2026-05-20" })];
    const leaves = [
      {
        id: "l1",
        userId: "user-1",
        requestType: "ferie",
        startDate: "2026-05-20",
        endDate: "2026-05-20",
        status: "approvato",
        note: null,
      },
    ];
    const conflicts = buildPlanningAssistentialConflicts({
      items,
      leaves,
      blocks: [],
      nameById: name,
    });
    const rows = buildTraineeWeeklyPlanningSummaries({
      items,
      leaves,
      blocks: [],
      conflicts,
      nameById: name,
      monthStart,
      monthEnd,
      userIds: ["user-1"],
    });
    const day = rows[0]!.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-05-20");
    expect(day?.conflictMessages.some((m) => /ferie/i.test(m))).toBe(true);
    const week = rows[0]!.weeks.find((w) => w.days.some((d) => d.date === "2026-05-20"));
    expect(week?.weekHasConflicts).toBe(true);
  });
});

describe("collectTraineeWeeklySummaryUserIds", () => {
  it("rispetta preferredOrder e aggiunge id extra", () => {
    const ids = collectTraineeWeeklySummaryUserIds({
      items: [baseShift({ assigned_to: "b", id: "x", shift_date: "2026-05-01" })],
      leaves: [
        {
          id: "1",
          userId: "a",
          requestType: "ferie",
          startDate: "2026-05-01",
          endDate: "2026-05-02",
          status: "approvato",
          note: null,
        },
      ],
      blocks: [],
      preferredOrder: ["a", "b", "c"],
    });
    expect(ids).toEqual(["a", "b"]);
  });
});
