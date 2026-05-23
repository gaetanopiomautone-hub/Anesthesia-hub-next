import { describe, expect, it, vi } from "vitest";

import type { TraineeAssignmentPeriodRow } from "@/lib/domain/trainee-assignment-period";
import {
  resolveProfileAssegnazioneFromPeriods,
  syncProfileAssegnazioneFromActivePeriod,
} from "@/lib/data/trainee-assignment-period-sync";

const period = (
  overrides: Partial<TraineeAssignmentPeriodRow> & Pick<TraineeAssignmentPeriodRow, "starts_on" | "ends_on" | "ambito">,
): TraineeAssignmentPeriodRow => ({
  id: "p1",
  trainee_id: "u1",
  note: null,
  ...overrides,
});

describe("resolveProfileAssegnazioneFromPeriods", () => {
  const ref = "2026-05-23";

  it("restituisce ambito se c’è un solo periodo attivo", () => {
    expect(
      resolveProfileAssegnazioneFromPeriods(
        [period({ starts_on: "2026-01-01", ends_on: "2026-12-31", ambito: "sala_base" })],
        ref,
      ),
    ).toBe("sala_base");
  });

  it("non allinea con zero periodi attivi", () => {
    expect(
      resolveProfileAssegnazioneFromPeriods(
        [period({ starts_on: "2024-01-01", ends_on: "2024-06-30", ambito: "sala_base" })],
        ref,
      ),
    ).toBeNull();
  });

  it("non allinea con due periodi attivi (anche ambiti diversi)", () => {
    expect(
      resolveProfileAssegnazioneFromPeriods(
        [
          period({ id: "a", starts_on: "2026-01-01", ends_on: "2026-12-31", ambito: "sala_base" }),
          period({ id: "b", starts_on: "2026-03-01", ends_on: "2026-09-30", ambito: "rianimazione" }),
        ],
        ref,
      ),
    ).toBeNull();
  });
});

describe("syncProfileAssegnazioneFromActivePeriod", () => {
  it("chiama update solo con un periodo attivo", async () => {
    const update = vi.fn();
    await syncProfileAssegnazioneFromActivePeriod({
      traineeId: "u1",
      periods: [period({ starts_on: "2026-01-01", ends_on: "2026-12-31", ambito: "sala_avanzata" })],
      updateAssegnazione: update,
      reference: "2026-05-23",
    });
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith("sala_avanzata");
  });

  it("non chiama update con più periodi attivi", async () => {
    const update = vi.fn();
    await syncProfileAssegnazioneFromActivePeriod({
      traineeId: "u1",
      periods: [
        period({ id: "a", starts_on: "2026-01-01", ends_on: "2026-12-31", ambito: "sala_base" }),
        period({ id: "b", starts_on: "2026-05-01", ends_on: "2026-06-30", ambito: "rianimazione" }),
      ],
      updateAssegnazione: update,
      reference: "2026-05-23",
    });
    expect(update).not.toHaveBeenCalled();
  });
});
