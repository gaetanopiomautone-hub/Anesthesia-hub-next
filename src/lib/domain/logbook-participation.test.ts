import { describe, expect, it } from "vitest";

import {
  LOGBOOK_PARTICIPATION_ROLE_VALUES,
  participationRoleFromLegacy,
} from "@/lib/domain/logbook-participation";

describe("participationRoleFromLegacy", () => {
  it("mappa autonomo → eseguito autonomamente", () => {
    expect(
      participationRoleFromLegacy({ supervision_level: "diretta", autonomy_level: "autonomo" }),
    ).toBe("eseguito_autonomamente");
  });

  it("mappa con supervisione → eseguito supervisionato", () => {
    expect(
      participationRoleFromLegacy({ supervision_level: "indiretta", autonomy_level: "con_supervisione" }),
    ).toBe("eseguito_supervisionato");
  });

  it("espone i quattro ruoli formativi", () => {
    expect(LOGBOOK_PARTICIPATION_ROLE_VALUES).toEqual([
      "osservato",
      "assistito",
      "eseguito_supervisionato",
      "eseguito_autonomamente",
    ]);
  });
});
