import { describe, expect, it } from "vitest";

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

import {
  competencyOverlapsMonth,
  competencyRowActiveOnDate,
  competencySelectOptionMeta,
  evaluateShiftAssignmentCompetencyHint,
  matchingCompetenciesForShiftItem,
  pickDominantCompetencyStatus,
} from "./trainee-competency-assignment-hint";
import type { TraineeLocationCompetencyInput } from "./trainee-competency-assignment-hint";

const baseItem: Pick<ShiftItemRow, "assignment_location_id" | "clinical_area_id" | "kind"> = {
  kind: "sala",
  assignment_location_id: "loc-1",
  clinical_area_id: "area-1",
};

function row(
  overrides: Partial<TraineeLocationCompetencyInput> & Pick<TraineeLocationCompetencyInput, "status">,
): TraineeLocationCompetencyInput {
  return {
    id: "c1",
    trainee_id: "u1",
    assignment_location_id: "loc-1",
    clinical_area_id: null,
    note: null,
    starts_on: null,
    ends_on: null,
    ...overrides,
  };
}

describe("competencyRowActiveOnDate", () => {
  it("ignora competenza scaduta", () => {
    expect(
      competencyRowActiveOnDate({ starts_on: "2026-01-01", ends_on: "2026-05-10" }, "2026-05-11"),
    ).toBe(false);
  });

  it("include range valido", () => {
    expect(
      competencyRowActiveOnDate({ starts_on: "2026-05-01", ends_on: "2026-05-31" }, "2026-05-11"),
    ).toBe(true);
  });
});

describe("evaluateShiftAssignmentCompetencyHint", () => {
  it("preferenziale → positive", () => {
    const h = evaluateShiftAssignmentCompetencyHint({
      traineeId: "u1",
      shiftDateYmd: "2026-05-11",
      item: baseItem,
      competencyRows: [row({ status: "preferenziale" })],
    });
    expect(h.severity).toBe("positive");
    expect(h.status).toBe("preferenziale");
    expect(h.shortLabel).toContain("preferenz");
  });

  it("rotazione attiva → positive", () => {
    const h = evaluateShiftAssignmentCompetencyHint({
      traineeId: "u1",
      shiftDateYmd: "2026-05-11",
      item: baseItem,
      competencyRows: [
        row({
          status: "rotazione",
          starts_on: "2026-05-01",
          ends_on: "2026-05-31",
        }),
      ],
    });
    expect(h.severity).toBe("positive");
    expect(h.status).toBe("rotazione");
  });

  it("non assegnabile → warning", () => {
    const h = evaluateShiftAssignmentCompetencyHint({
      traineeId: "u1",
      shiftDateYmd: "2026-05-11",
      item: baseItem,
      competencyRows: [row({ status: "non_assegnabile" })],
    });
    expect(h.severity).toBe("warning");
    expect(h.status).toBe("non_assegnabile");
  });

  it("nessuna competenza → neutral", () => {
    const h = evaluateShiftAssignmentCompetencyHint({
      traineeId: "u1",
      shiftDateYmd: "2026-05-11",
      item: baseItem,
      competencyRows: [],
    });
    expect(h.severity).toBe("neutral");
    expect(h.status).toBeNull();
  });

  it("competenza scaduta ignorata → neutral senza match", () => {
    const h = evaluateShiftAssignmentCompetencyHint({
      traineeId: "u1",
      shiftDateYmd: "2026-06-01",
      item: baseItem,
      competencyRows: [
        row({
          status: "preferenziale",
          starts_on: "2026-05-01",
          ends_on: "2026-05-31",
        }),
      ],
    });
    expect(h.status).toBeNull();
    expect(h.message).toMatch(/Nessuna competenza/);
  });

  it("non_assegnabile vince su preferenziale", () => {
    const dom = pickDominantCompetencyStatus([
      row({ id: "a", status: "preferenziale" }),
      row({ id: "b", status: "non_assegnabile" }),
    ]);
    expect(dom).toBe("non_assegnabile");
  });

  it("solo abilitato → neutral", () => {
    const h = evaluateShiftAssignmentCompetencyHint({
      traineeId: "u1",
      shiftDateYmd: "2026-05-11",
      item: baseItem,
      competencyRows: [row({ status: "abilitato" })],
    });
    expect(h.severity).toBe("neutral");
    expect(h.status).toBe("abilitato");
  });
});

describe("matchingCompetenciesForShiftItem", () => {
  it("match su clinical_area se location diversa", () => {
    const m = matchingCompetenciesForShiftItem(
      [
        row({
          id: "1",
          assignment_location_id: null,
          clinical_area_id: "area-1",
          status: "abilitato",
        }),
      ],
      "u1",
      "2026-05-11",
      { kind: "sala", assignment_location_id: "altro-loc", clinical_area_id: "area-1" },
    );
    expect(m).toHaveLength(1);
  });
});

describe("competencySelectOptionMeta", () => {
  it("usa suffisso breve (non testo lungo) per la select", () => {
    const meta = competencySelectOptionMeta(
      [row({ status: "preferenziale" })],
      "u1",
      "2026-05-11",
      baseItem,
    );
    expect(meta.suffix).toBe(" ·pref");
    expect(meta.optionTitle).toBeTruthy();
  });

  it("non_assegnabile → codice !", () => {
    const meta = competencySelectOptionMeta(
      [row({ status: "non_assegnabile" })],
      "u1",
      "2026-05-11",
      baseItem,
    );
    expect(meta.suffix).toBe(" ·!");
  });
});

describe("competencyOverlapsMonth", () => {
  it("scaduta prima del mese → false", () => {
    expect(
      competencyOverlapsMonth({ starts_on: "2026-01-01", ends_on: "2026-04-30" }, "2026-05-01", "2026-05-31"),
    ).toBe(false);
  });
});
