import { describe, expect, it } from "vitest";

import { buildLogbookPortfolioReport } from "@/lib/domain/logbook-portfolio";

describe("buildLogbookPortfolioReport", () => {
  const sciaticoPopliteo = {
    performed_on: "2026-05-20",
    quantity: 2,
    participation_role: "eseguito_supervisionato" as const,
    procedure_catalog: {
      category: "Blocchi perinervosi",
      procedure_name: "Sciatico",
      subtype: "Popliteo",
      name: "Sciatico — Popliteo",
    },
  };

  it("somma quantity sul totale e per procedura", () => {
    const report = buildLogbookPortfolioReport([
      sciaticoPopliteo,
      {
        ...sciaticoPopliteo,
        quantity: 1,
        participation_role: "assistito",
      },
    ]);

    expect(report.totalQuantity).toBe(3);
    expect(report.entryCount).toBe(2);
    const proc = report.byProcedure.find((r) => r.label.includes("Popliteo"));
    expect(proc?.value).toBe(3);
  });

  it("filtra per categoria", () => {
    const report = buildLogbookPortfolioReport(
      [
        sciaticoPopliteo,
        {
          performed_on: "2026-05-10",
          quantity: 1,
          participation_role: "osservato",
          procedure_catalog: {
            category: "Intubazione",
            procedure_name: "Fibroscopica",
            subtype: null,
            name: "Fibroscopica",
          },
        },
      ],
      { categoryFilter: "Blocchi perinervosi" },
    );

    expect(report.totalQuantity).toBe(2);
    expect(report.byCategory).toHaveLength(1);
    expect(report.byCategory[0]?.label).toBe("Blocchi perinervosi");
  });

  it("include attività ordinate per data decrescente", () => {
    const report = buildLogbookPortfolioReport([
      { ...sciaticoPopliteo, performed_on: "2026-05-01" },
      {
        performed_on: "2026-05-31",
        quantity: 1,
        participation_role: "assistito",
        procedure_catalog: {
          category: "Intubazione",
          procedure_name: "Fibroscopica",
          subtype: null,
          name: "Fibroscopica",
        },
      },
    ]);

    expect(report.activities).toHaveLength(2);
    expect(report.activities[0]?.performedOn).toBe("2026-05-31");
    expect(report.activities[1]?.performedOn).toBe("2026-05-01");
  });
});
