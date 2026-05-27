import { describe, expect, it } from "vitest";

import { buildLogbookPortfolioReport } from "@/lib/domain/logbook-portfolio";

import { renderLogbookPortfolioPdfToBuffer } from "./logbook-portfolio-pdf-render";

describe("renderLogbookPortfolioPdfToBuffer", () => {
  it("produce un PDF valido con tabelle portfolio", async () => {
    const report = buildLogbookPortfolioReport([
      {
        quantity: 2,
        participation_role: "eseguito_supervisionato",
        procedure_catalog: {
          category: "Blocchi perinervosi",
          procedure_name: "Sciatico",
          subtype: "Popliteo",
          name: "Sciatico — Popliteo",
        },
      },
    ]);

    const buf = await renderLogbookPortfolioPdfToBuffer(report, {
      orgLine: "Scuola di specializzazione — Test",
      traineeLabel: "Mario Rossi",
      annoSpecialita: 3,
      periodFromLabel: "01/01/2026",
      periodToLabel: "31/12/2026",
      categoryFilter: null,
      generatedAtLabel: "23/05/2026 12:00",
    });

    expect(buf.length).toBeGreaterThan(400);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
