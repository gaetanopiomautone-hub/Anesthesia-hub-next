import { describe, expect, it } from "vitest";

import { buildMonthlyShiftPlanPdfTableRows } from "@/lib/domain/monthly-shift-plan-pdf-table";

import { renderMonthlyShiftPlanPdfToBuffer } from "./monthly-shift-plan-pdf-render";

describe("renderMonthlyShiftPlanPdfToBuffer", () => {
  it("produce un PDF valido (header %PDF) anche con molte righe", async () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sala ${i} — Nome Lungo ${i}`).join(" / ");
    const lines = Array.from({ length: 31 }, (_, d) => ({
      dateStr: `2026-05-${String(d + 1).padStart(2, "0")}`,
      dayLabel: `giorno ${d + 1}`,
      mattinaLines: [long],
      pomeriggioLines: [long],
      reperLines: [`Rossi — 333${d}`],
    }));
    const buf = await renderMonthlyShiftPlanPdfToBuffer(lines, {
      orgLine: "Test org",
      monthTitleIt: "Maggio 2026",
      generatedAtLabel: "11/05/2026 12:00",
      planStatusLabel: "Approvata",
      approvedAtLabel: "10/05/2026 09:00",
      publicationLine: "Pubblicazione: pubblicato il 12/05/2026 alle 18:30",
      planIdShort: "abcd1234…",
    });
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("integrazione con buildMonthlyShiftPlanPdfTableRows", async () => {
    const rows = buildMonthlyShiftPlanPdfTableRows({
      items: [],
      monthStart: "2026-05-01",
      monthEnd: "2026-05-03",
      nameById: () => "—",
      phoneById: () => "",
    });
    const buf = await renderMonthlyShiftPlanPdfToBuffer(rows, {
      orgLine: null,
      monthTitleIt: "Maggio 2026",
      generatedAtLabel: "x",
      planStatusLabel: "Approvata",
      approvedAtLabel: null,
      publicationLine: "Pubblicazione: non ancora pubblicato",
      planIdShort: "id…",
    });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
