import { describe, expect, it } from "vitest";

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

import { buildMonthlyShiftPlanPdfTableRows } from "./monthly-shift-plan-pdf-table";

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
    assignment_location_id: null,
    assignment_location: null,
    notes: null,
    source: "manual",
    assigned_to: "u1",
    created_at: "",
    updated_at: "",
    ...overrides,
  } as ShiftItemRow;
}

describe("buildMonthlyShiftPlanPdfTableRows", () => {
  const nameById = (id: string) => (id === "u1" ? "Rossi" : id);
  const phoneById = (id: string) => (id === "u1" ? "3331234567" : "");

  it("Mattina e pomeriggio sala con nome assegnato", () => {
    const items = [
      baseItem({ id: "a", period: "mattina" }),
      baseItem({ id: "b", period: "pomeriggio" }),
    ];
    const rows = buildMonthlyShiftPlanPdfTableRows({
      items,
      monthStart: "2026-05-11",
      monthEnd: "2026-05-11",
      nameById,
      phoneById,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mattinaLines.some((l) => l.includes("Sala Orto") && l.includes("Rossi"))).toBe(true);
    expect(rows[0]!.pomeriggioLines.some((l) => l.includes("Sala Orto") && l.includes("Rossi"))).toBe(true);
  });

  it("Reperibilità con telefono", () => {
    const items = [
      baseItem({
        id: "r",
        kind: "reperibilita",
        period: "reperibilita",
      }),
    ];
    const rows = buildMonthlyShiftPlanPdfTableRows({
      items,
      monthStart: "2026-05-11",
      monthEnd: "2026-05-11",
      nameById,
      phoneById,
    });
    expect(rows[0]!.reperLines.join(" ")).toMatch(/Rossi/);
    expect(rows[0]!.reperLines.join(" ")).toMatch(/3331234567/);
  });

  it("Giornata assistenziale solo in colonna mattina con prefisso Giornata", () => {
    const items = [baseItem({ id: "g", period: "giornata" })];
    const rows = buildMonthlyShiftPlanPdfTableRows({
      items,
      monthStart: "2026-05-11",
      monthEnd: "2026-05-11",
      nameById,
      phoneById,
    });
    expect(rows[0]!.mattinaLines.some((l) => l.startsWith("Giornata ·"))).toBe(true);
    expect(rows[0]!.pomeriggioLines).toEqual([]);
  });
});
