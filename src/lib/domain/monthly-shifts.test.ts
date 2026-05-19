import { describe, expect, it } from "vitest";

import {
  formatShiftItemPlanningLocation,
  formatShiftPlanPublicationLineItalian,
  formatShiftPlanPublicationSummaryItalian,
  isMonthlyShiftsPublished,
  shiftItemLocationParts,
  type MonthlyShiftPlanRow,
  type ShiftItemRow,
} from "./monthly-shifts";

function plan(partial: Partial<MonthlyShiftPlanRow>): MonthlyShiftPlanRow {
  return {
    id: "p1",
    year: 2026,
    month: 5,
    status: "draft",
    created_by: null,
    submitted_at: null,
    approved_by: null,
    approved_at: null,
    reopened_at: null,
    published_at: null,
    published_by: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("isMonthlyShiftsPublished", () => {
  it("true solo se approvato e published_at valorizzato", () => {
    expect(isMonthlyShiftsPublished(plan({ status: "approved", published_at: "2026-05-01T10:00:00Z" }))).toBe(true);
    expect(isMonthlyShiftsPublished(plan({ status: "approved", published_at: null }))).toBe(false);
    expect(isMonthlyShiftsPublished(plan({ status: "submitted", published_at: "2026-05-01T10:00:00Z" }))).toBe(false);
  });
});

function locItem(
  partial: Partial<ShiftItemRow>,
): Pick<ShiftItemRow, "clinical_area" | "specialty" | "assignment_location" | "room_name" | "label"> {
  return {
    clinical_area: null,
    specialty: null,
    assignment_location: null,
    room_name: null,
    label: "Etichetta",
    ...partial,
  };
}

describe("formatShiftItemPlanningLocation", () => {
  it("mostra area clinica prima e sala dopo", () => {
    const item = locItem({
      clinical_area: { id: "a1", code: "ORTO", name: "Ortopedia", is_active: true },
      room_name: "Sala 2",
    });
    expect(formatShiftItemPlanningLocation(item)).toBe("Ortopedia · Sala 2");
    expect(shiftItemLocationParts(item)).toEqual({ primary: "Ortopedia", secondary: "Sala 2" });
  });

  it("usa assignment_location come sala se presente", () => {
    const item = locItem({
      clinical_area: { id: "a1", code: "CG", name: "Chirurgia generale", is_active: true },
      assignment_location: { id: "l1", name: "Sala 1", kind: "sala", is_active: true },
    });
    expect(formatShiftItemPlanningLocation(item)).toBe("Chirurgia generale · Sala 1");
  });

  it("fallback a room_name se manca clinical_area", () => {
    const item = locItem({ room_name: "Sala Orto" });
    expect(formatShiftItemPlanningLocation(item)).toBe("Sala Orto");
  });

  it("usa specialty se clinical_area assente", () => {
    const item = locItem({ specialty: "Rianimazione", room_name: "Sala 3" });
    expect(formatShiftItemPlanningLocation(item)).toBe("Rianimazione · Sala 3");
  });
});

describe("formatShiftPlanPublicationLineItalian", () => {
  it("non pubblicato se manca published_at", () => {
    expect(formatShiftPlanPublicationLineItalian(plan({ status: "approved", published_at: null }))).toBe(
      "Pubblicazione: non ancora pubblicato",
    );
    expect(formatShiftPlanPublicationSummaryItalian(plan({ status: "approved", published_at: null }))).toBe(
      "non ancora pubblicato",
    );
  });

  it("pubblicato con data e ora locali formattate", () => {
    const line = formatShiftPlanPublicationLineItalian(
      plan({ status: "approved", published_at: "2026-05-12T16:30:00.000Z" }),
    );
    expect(line).toMatch(/^Pubblicazione: pubblicato il 12\/05\/2026 alle \d{2}:\d{2}$/);
  });
});
