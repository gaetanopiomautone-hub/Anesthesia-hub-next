import { describe, expect, it } from "vitest";

import { buildLogbookPersonalStats } from "./logbook-personal-stats";

describe("buildLogbookPersonalStats", () => {
  it("aggregates quantity by procedure label and summary metrics", () => {
    const stats = buildLogbookPersonalStats([
      {
        quantity: 2,
        performed_on: "2026-05-20",
        procedure_catalog: {
          category: "Anestesia neuroassiale",
          procedure_name: "Spinale",
          subtype: "",
          name: "Spinale",
        },
      },
      {
        quantity: 1,
        performed_on: "2026-05-31",
        procedure_catalog: {
          category: "Anestesia neuroassiale",
          procedure_name: "Epidurale",
          subtype: "",
          name: "Epidurale",
        },
      },
      {
        quantity: 3,
        performed_on: "2026-05-15",
        procedure_catalog: {
          category: "Anestesia neuroassiale",
          procedure_name: "Spinale",
          subtype: "",
          name: "Spinale",
        },
      },
    ]);

    expect(stats.totalProcedures).toBe(6);
    expect(stats.categoriesUsed).toBe(1);
    expect(stats.lastRegistration).toBe("2026-05-31");
    expect(stats.procedureTotals).toEqual([
      { label: "Anestesia neuroassiale › Spinale", total: 5 },
      { label: "Anestesia neuroassiale › Epidurale", total: 1 },
    ]);
  });

  it("defaults missing quantity to 1", () => {
    const stats = buildLogbookPersonalStats([
      {
        procedure_catalog: {
          category: "Accessi",
          procedure_name: "Arteriosa",
          subtype: "Radiale",
          name: "Radiale",
        },
      },
    ]);

    expect(stats.totalProcedures).toBe(1);
    expect(stats.procedureTotals[0]?.total).toBe(1);
  });
});
