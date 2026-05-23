import { describe, expect, it } from "vitest";

import {
  LOGBOOK_PROCEDURE_CATALOG,
  formatProcedureCatalogDisplayName,
  groupProcedureCatalogRows,
} from "@/lib/domain/logbook-procedure-catalog";

describe("LOGBOOK_PROCEDURE_CATALOG", () => {
  it("contiene 27 voci foglia", () => {
    expect(LOGBOOK_PROCEDURE_CATALOG).toHaveLength(27);
  });

  it("modella sciatico con sottotipi distinti", () => {
    const sciatic = LOGBOOK_PROCEDURE_CATALOG.filter(
      (l) => l.category === "Blocchi perinervosi" && l.procedure === "Sciatico",
    );
    expect(sciatic.map((s) => s.subtype)).toEqual(["Sottogluteo", "Popliteo", "Via anteriore"]);
  });
});

describe("groupProcedureCatalogRows", () => {
  it("raggruppa per categoria e procedura", () => {
    const grouped = groupProcedureCatalogRows([
      { id: "1", category: "Intubazione", procedure_name: "Fibroscopica", subtype: null },
      { id: "2", category: "Blocchi perinervosi", procedure_name: "Sciatico", subtype: "Popliteo" },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.category).toBe("Blocchi perinervosi");
    expect(formatProcedureCatalogDisplayName({ procedure: "Sciatico", subtype: "Popliteo" })).toBe(
      "Sciatico — Popliteo",
    );
  });
});
