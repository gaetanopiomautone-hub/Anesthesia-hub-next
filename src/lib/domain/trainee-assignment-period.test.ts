import { describe, expect, it } from "vitest";

import {
  assignmentPeriodRangesOverlap,
  findOverlappingAssignmentPeriod,
  isAssignmentPeriodActive,
} from "@/lib/domain/trainee-assignment-period";
import type { TraineeAssignmentPeriodRow } from "@/lib/domain/trainee-assignment-period";

const base = (overrides: Partial<TraineeAssignmentPeriodRow>): TraineeAssignmentPeriodRow => ({
  id: "a",
  trainee_id: "u1",
  starts_on: "2024-01-01",
  ends_on: "2024-06-30",
  ambito: "sala_base",
  note: null,
  ...overrides,
});

describe("assignmentPeriodRangesOverlap", () => {
  it("rileva sovrapposizione parziale", () => {
    expect(assignmentPeriodRangesOverlap("2024-01-01", "2024-06-30", "2024-03-01", "2024-09-01")).toBe(true);
  });

  it("non segnala adiacenti senza giorni in comune", () => {
    expect(assignmentPeriodRangesOverlap("2024-01-01", "2024-06-30", "2024-07-01", "2024-12-31")).toBe(false);
  });

  it("rileva stesso giorno di confine come sovrapposizione", () => {
    expect(assignmentPeriodRangesOverlap("2024-01-01", "2024-06-30", "2024-06-30", "2024-12-31")).toBe(true);
  });
});

describe("findOverlappingAssignmentPeriod", () => {
  const periods: TraineeAssignmentPeriodRow[] = [
    base({ id: "1", starts_on: "2024-01-01", ends_on: "2024-06-30", ambito: "sala_base" }),
    base({ id: "2", starts_on: "2026-09-01", ends_on: "2026-12-31", ambito: "sala_locoregionale" }),
  ];

  it("blocca sovrapposizione stesso ambito", () => {
    const hit = findOverlappingAssignmentPeriod(periods, {
      startsOn: "2024-03-01",
      endsOn: "2024-09-01",
      ambito: "sala_base",
    });
    expect(hit?.id).toBe("1");
  });

  it("consente periodi sovrapposti su ambiti diversi", () => {
    const hit = findOverlappingAssignmentPeriod(periods, {
      startsOn: "2026-10-01",
      endsOn: "2026-11-30",
      ambito: "sala_base",
    });
    expect(hit).toBeNull();
  });

  it("esclude il record in modifica", () => {
    const hit = findOverlappingAssignmentPeriod(periods, {
      startsOn: "2024-01-01",
      endsOn: "2024-06-30",
      ambito: "sala_base",
      excludeId: "1",
    });
    expect(hit).toBeNull();
  });
});

describe("isAssignmentPeriodActive", () => {
  it("attivo se la data di riferimento è nell'intervallo", () => {
    expect(
      isAssignmentPeriodActive({ starts_on: "2024-01-01", ends_on: "2024-06-30" }, "2024-03-15"),
    ).toBe(true);
    expect(
      isAssignmentPeriodActive({ starts_on: "2024-01-01", ends_on: "2024-06-30" }, "2024-07-01"),
    ).toBe(false);
  });
});
