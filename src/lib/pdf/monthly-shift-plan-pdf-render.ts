import PDFDocument from "pdfkit";

import type { MonthlyShiftPlanPdfDayRow } from "@/lib/domain/monthly-shift-plan-pdf-table";

type PdfDoc = InstanceType<typeof PDFDocument>;

export type MonthlyShiftPlanPdfMeta = {
  /** Intestazione opzionale (scuola / reparto), da env o config. */
  orgLine: string | null;
  /** Es. "maggio 2026" */
  monthTitleIt: string;
  /** ISO o stringa già formattata per il documento */
  generatedAtLabel: string;
  /** Stato piano in chiaro */
  planStatusLabel: string;
  /** Data/ora approvazione (etichetta già formattata), se presente */
  approvedAtLabel: string | null;
  /** Es. "Pubblicazione: pubblicato il …" o "Pubblicazione: non ancora pubblicato" */
  publicationLine: string;
  /** Identificativo breve piano (UUID troncato) */
  planIdShort: string;
};

const FOOTER_NOTE =
  "Le reperibilità non concorrono al monte ore assistenziale. Documento generato automaticamente dal gestionale.";

function cellBody(lines: string[]): string {
  return lines.length > 0 ? lines.join("\n") : "—";
}

function rowHeight(
  doc: PdfDoc,
  mattina: string[],
  pomeriggio: string[],
  reper: string[],
  colW: { m: number; p: number; r: number },
  lineGap: number,
): number {
  const pad = 6;
  const t1 = cellBody(mattina);
  const t2 = cellBody(pomeriggio);
  const t3 = cellBody(reper);
  doc.font("Helvetica").fontSize(8);
  const h1 = doc.heightOfString(t1, { width: colW.m, lineGap });
  const h2 = doc.heightOfString(t2, { width: colW.p, lineGap });
  const h3 = doc.heightOfString(t3, { width: colW.r, lineGap });
  return Math.max(h1, h2, h3, 14) + pad;
}

export function renderMonthlyShiftPlanPdfToBuffer(
  rows: MonthlyShiftPlanPdfDayRow[],
  meta: MonthlyShiftPlanPdfMeta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      bufferPages: true,
      layout: "landscape",
      size: "A4",
      margins: { top: 36, bottom: 48, left: 36, right: 36 },
      info: {
        Title: `Turni mensili — ${meta.monthTitleIt}`,
        Author: "Anesthesia Hub",
        Subject: "Planning turni specializzandi",
      },
    });

    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 36;
    const contentW = doc.page.width - margin * 2;
    const colDay = 78;
    const colReper = 108;
    const colMp = (contentW - colDay - colReper) / 2;
    const colW = { m: colMp, p: colMp, r: colReper };
    const lineGap = 1;
    const bottomReserve = 52;
    let y = margin;

    const drawHeader = (isContinuation: boolean) => {
      y = margin;
      doc.font("Helvetica-Bold").fontSize(16).text("Turni mensili specializzandi", margin, y, {
        width: contentW,
        align: "center",
      });
      y += 22;
      doc.font("Helvetica").fontSize(11).text(meta.monthTitleIt, margin, y, { width: contentW, align: "center" });
      y += 16;
      if (meta.orgLine) {
        doc.font("Helvetica-Bold").fontSize(10).text(meta.orgLine, margin, y, { width: contentW, align: "center" });
        y += 14;
      }
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#444444")
        .text(`Generato il: ${meta.generatedAtLabel}`, margin, y, { width: contentW, align: "center" });
      y += 12;
      const ver = [
        `Stato piano: ${meta.planStatusLabel}`,
        meta.approvedAtLabel ? `Approvazione: ${meta.approvedAtLabel}` : null,
        `ID piano: ${meta.planIdShort}`,
      ]
        .filter(Boolean)
        .join(" · ");
      doc.text(ver, margin, y, { width: contentW, align: "center" });
      y += 12;
      doc.text(meta.publicationLine, margin, y, { width: contentW, align: "center" });
      y += 14;
      if (isContinuation) {
        doc.font("Helvetica-Oblique").fontSize(8).text("(segue)", margin, y, { width: contentW, align: "center" });
        y += 12;
      }
      doc.fillColor("#000000");
      y += 4;

      doc.font("Helvetica-Bold").fontSize(8);
      doc.text("Giorno", margin, y, { width: colDay });
      doc.text("Mattina", margin + colDay, y, { width: colW.m });
      doc.text("Pomeriggio", margin + colDay + colW.m, y, { width: colW.p });
      doc.text("Reperibilità", margin + colDay + colW.m + colW.p, y, { width: colW.r });
      y += 12;
      doc
        .moveTo(margin, y)
        .lineTo(margin + contentW, y)
        .strokeColor("#cccccc")
        .lineWidth(0.5)
        .stroke();
      doc.strokeColor("#000000").lineWidth(1);
      y += 6;
    };

    drawHeader(false);

    for (const row of rows) {
      const h = rowHeight(doc, row.mattinaLines, row.pomeriggioLines, row.reperLines, colW, lineGap);
      if (y + h > doc.page.height - bottomReserve) {
        doc.addPage({ layout: "landscape", size: "A4", margins: { top: 36, bottom: 48, left: 36, right: 36 } });
        drawHeader(true);
      }

      const y0 = y;
      doc.font("Helvetica-Bold").fontSize(8).text(row.dayLabel, margin, y0, { width: colDay, lineGap });
      doc.font("Helvetica").fontSize(8);
      doc.text(cellBody(row.mattinaLines), margin + colDay, y0, { width: colW.m, lineGap });
      doc.text(cellBody(row.pomeriggioLines), margin + colDay + colW.m, y0, { width: colW.p, lineGap });
      doc.text(cellBody(row.reperLines), margin + colDay + colW.m + colW.p, y0, { width: colW.r, lineGap });
      y = y0 + h;
      doc.moveTo(margin, y - 2).lineTo(margin + contentW, y - 2).strokeColor("#eeeeee").lineWidth(0.3).stroke();
      doc.strokeColor("#000000").lineWidth(1);
    }

    /** Con `bufferPages`, ripete il footer su ogni pagina (mesi densi / più pagine). */
    const drawFooterOnCurrentPage = () => {
      const footY = doc.page.height - margin - 22;
      doc.font("Helvetica").fontSize(7).fillColor("#555555");
      doc.text(`${FOOTER_NOTE} — ${meta.generatedAtLabel}`, margin, footY, {
        width: contentW,
        align: "center",
      });
      doc.fillColor("#000000");
    };

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooterOnCurrentPage();
    }

    doc.end();
  });
}
