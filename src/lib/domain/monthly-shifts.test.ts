import { describe, expect, it } from "vitest";

import {
  formatShiftPlanPublicationLineItalian,
  formatShiftPlanPublicationSummaryItalian,
  isMonthlyShiftsPublished,
  type MonthlyShiftPlanRow,
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
