import { describe, expect, it } from "vitest";

/**
 * Replica la logica di aggregateTopProcedures (logbook report) per verificare somma quantity.
 */
function aggregateQuantityByLabel(
  rows: {
    quantity?: number;
    procedure_catalog: {
      category: string;
      procedure_name: string;
      subtype: string | null;
      name: string;
    } | null;
  }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const proc = row.procedure_catalog;
    const qty = Math.max(1, Number(row.quantity ?? 1));
    const label = proc
      ? `${proc.category} › ${proc.procedure_name}${proc.subtype?.trim() ? ` — ${proc.subtype}` : ""}`
      : "Procedura";
    counts.set(label, (counts.get(label) ?? 0) + qty);
  }
  return counts;
}

describe("logbook report quantity aggregation", () => {
  it("somma quantity sulla stessa procedura", () => {
    const proc = {
      category: "Blocchi perinervosi",
      procedure_name: "Sciatico",
      subtype: "Popliteo",
      name: "Sciatico — Popliteo",
    };
    const counts = aggregateQuantityByLabel([
      { quantity: 2, procedure_catalog: proc },
      { quantity: 3, procedure_catalog: proc },
    ]);
    const key = "Blocchi perinervosi › Sciatico — Popliteo";
    expect(counts.get(key)).toBe(5);
  });

  it("default quantity 1 se assente", () => {
    const counts = aggregateQuantityByLabel([
      {
        procedure_catalog: {
          category: "Intubazione",
          procedure_name: "Fibroscopica",
          subtype: null,
          name: "Fibroscopica",
        },
      },
    ]);
    expect(counts.get("Intubazione › Fibroscopica")).toBe(1);
  });
});
