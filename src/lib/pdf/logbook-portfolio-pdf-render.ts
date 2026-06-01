import PDFDocument from "pdfkit";

import type {
  LogbookPortfolioActivityRow,
  LogbookPortfolioReport,
  PortfolioBreakdownRow,
} from "@/lib/domain/logbook-portfolio";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";

type PdfDoc = InstanceType<typeof PDFDocument>;

export type LogbookPortfolioPdfMeta = {
  orgLine: string | null;
  traineeLabel: string;
  annoSpecialita: number | null;
  periodFromLabel: string;
  periodToLabel: string;
  categoryFilter: string | null;
  generatedAtLabel: string;
};

const FOOTER_NOTE = "Portfolio generato dal logbook procedure — nessun dato identificativo paziente.";

function drawTable(
  doc: PdfDoc,
  margin: number,
  contentW: number,
  startY: number,
  title: string,
  rows: PortfolioBreakdownRow[],
  bottomReserve: number,
): number {
  let y = startY;

  if (y > doc.page.height - bottomReserve - 80) {
    doc.addPage({ size: "A4", layout: "portrait", margins: { top: 48, bottom: 56, left: 48, right: 48 } });
    y = 48;
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text(title, margin, y, { width: contentW });
  y += 18;

  const colLabel = contentW * 0.72;
  const colVal = contentW - colLabel;

  doc.font("Helvetica-Bold").fontSize(9);
  doc.text("Voce", margin, y, { width: colLabel });
  doc.text("Totale", margin + colLabel, y, { width: colVal, align: "right" });
  y += 14;
  doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
  y += 6;

  if (rows.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Nessun dato nel periodo.", margin, y);
    return y + 20;
  }

  for (const row of rows) {
    const rowH =
      doc.font("Helvetica").fontSize(9).heightOfString(row.label, { width: colLabel, lineGap: 1 }) + 8;
    if (y + rowH > doc.page.height - bottomReserve) {
      doc.addPage({ size: "A4", layout: "portrait", margins: { top: 48, bottom: 56, left: 48, right: 48 } });
      y = 48;
    }
    doc.fillColor("#000000").font("Helvetica").fontSize(9).text(row.label, margin, y, { width: colLabel, lineGap: 1 });
    doc.text(String(row.value), margin + colLabel, y, { width: colVal, align: "right" });
    y += rowH;
    doc.moveTo(margin, y - 2).lineTo(margin + contentW, y - 2).strokeColor("#eeeeee").lineWidth(0.3).stroke();
  }

  doc.strokeColor("#000000").lineWidth(1);
  return y + 12;
}

function drawActivitiesTable(
  doc: PdfDoc,
  margin: number,
  contentW: number,
  startY: number,
  activities: LogbookPortfolioActivityRow[],
  bottomReserve: number,
): number {
  let y = startY;

  if (y > doc.page.height - bottomReserve - 80) {
    doc.addPage({ size: "A4", layout: "portrait", margins: { top: 48, bottom: 56, left: 48, right: 48 } });
    y = 48;
  }

  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text("Attività registrate", margin, y, {
    width: contentW,
  });
  y += 18;

  const colDate = contentW * 0.14;
  const colQty = contentW * 0.08;
  const colRole = contentW * 0.22;
  const colProc = contentW - colDate - colQty - colRole;

  doc.font("Helvetica-Bold").fontSize(8);
  doc.text("Data", margin, y, { width: colDate });
  doc.text("Procedura", margin + colDate, y, { width: colProc });
  doc.text("Qtà", margin + colDate + colProc, y, { width: colQty, align: "right" });
  doc.text("Ruolo", margin + colDate + colProc + colQty, y, { width: colRole });
  y += 12;
  doc.moveTo(margin, y).lineTo(margin + contentW, y).strokeColor("#cccccc").lineWidth(0.5).stroke();
  y += 5;

  if (activities.length === 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#666666").text("Nessuna attività nel periodo.", margin, y);
    return y + 20;
  }

  for (const row of activities) {
    const dateLabel = row.performedOn ? formatDateItalian(row.performedOn) : "—";
    const procH = doc.font("Helvetica").fontSize(8).heightOfString(row.procedureLabel, {
      width: colProc,
      lineGap: 1,
    });
    const rowH = Math.max(procH, 10) + 6;

    if (y + rowH > doc.page.height - bottomReserve) {
      doc.addPage({ size: "A4", layout: "portrait", margins: { top: 48, bottom: 56, left: 48, right: 48 } });
      y = 48;
    }

    doc.fillColor("#000000").font("Helvetica").fontSize(8);
    doc.text(dateLabel, margin, y, { width: colDate });
    doc.text(row.procedureLabel, margin + colDate, y, { width: colProc, lineGap: 1 });
    doc.text(String(row.quantity), margin + colDate + colProc, y, { width: colQty, align: "right" });
    doc.text(row.roleLabel, margin + colDate + colProc + colQty, y, { width: colRole, lineGap: 1 });
    y += rowH;
    doc.moveTo(margin, y - 2).lineTo(margin + contentW, y - 2).strokeColor("#eeeeee").lineWidth(0.3).stroke();
  }

  return y + 12;
}

export function renderLogbookPortfolioPdfToBuffer(
  report: LogbookPortfolioReport,
  meta: LogbookPortfolioPdfMeta,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      bufferPages: true,
      layout: "portrait",
      size: "A4",
      margins: { top: 48, bottom: 56, left: 48, right: 48 },
      info: {
        Title: `Portfolio logbook — ${meta.traineeLabel}`,
        Author: "Anesthesia Hub",
        Subject: "Portfolio formativo procedure",
      },
    });

    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const margin = 48;
    const contentW = doc.page.width - margin * 2;
    const bottomReserve = 56;
    let y = margin;

    doc.font("Helvetica-Bold").fontSize(16).text("Portfolio formativo — Logbook procedure", margin, y, {
      width: contentW,
      align: "center",
    });
    y += 24;

    if (meta.orgLine) {
      doc.font("Helvetica-Bold").fontSize(10).text(meta.orgLine, margin, y, { width: contentW, align: "center" });
      y += 14;
    }

    doc.font("Helvetica").fontSize(10);
    doc.text(`Specializzando: ${meta.traineeLabel}`, margin, y, { width: contentW });
    y += 14;

    if (meta.annoSpecialita != null && meta.annoSpecialita >= 1 && meta.annoSpecialita <= 5) {
      doc.text(`Anno di specialità: ${meta.annoSpecialita}°`, margin, y, { width: contentW });
      y += 14;
    }

    doc.text(`Periodo: ${meta.periodFromLabel} — ${meta.periodToLabel}`, margin, y, { width: contentW });
    y += 14;

    if (meta.categoryFilter) {
      doc.text(`Categoria: ${meta.categoryFilter}`, margin, y, { width: contentW });
      y += 14;
    }

    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#555555")
      .text(`Generato il ${meta.generatedAtLabel}`, margin, y, { width: contentW });
    y += 16;
    doc.fillColor("#000000");

    doc.font("Helvetica-Bold").fontSize(11).text("Riepilogo", margin, y);
    y += 16;
    doc.font("Helvetica").fontSize(10);
    doc.text(`Totale procedure (somma quantità): ${report.totalQuantity}`, margin, y);
    y += 14;
    doc.text(`Registrazioni logbook: ${report.entryCount}`, margin, y);
    y += 20;

    y = drawTable(doc, margin, contentW, y, "Per ruolo formativo", report.byParticipationRole, bottomReserve);
    y = drawTable(doc, margin, contentW, y, "Per categoria", report.byCategory, bottomReserve);
    y = drawTable(doc, margin, contentW, y, "Per procedura", report.byProcedure, bottomReserve);
    drawActivitiesTable(doc, margin, contentW, y, report.activities, bottomReserve);

    const drawFooter = () => {
      const footY = doc.page.height - margin - 18;
      doc.font("Helvetica").fontSize(7).fillColor("#555555");
      doc.text(`${FOOTER_NOTE} — ${meta.generatedAtLabel}`, margin, footY, { width: contentW, align: "center" });
      doc.fillColor("#000000");
    };

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooter();
    }

    doc.end();
  });
}
