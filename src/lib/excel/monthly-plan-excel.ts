/**
 * Export Excel del piano mensile + statistiche + settimanale + conflitti (SheetJS `xlsx`).
 */

import * as XLSX from "xlsx";

import type { PlanningAssistentialConflict } from "@/lib/domain/planning-assistential-conflicts";
import { buildPlanningAssistentialConflicts } from "@/lib/domain/planning-assistential-conflicts";
import type { PlanningBlockInput, PlanningLeaveRangeInput } from "@/lib/domain/planning-assistential-conflicts";
import { buildMonthlyShiftPlanPdfTableRows } from "@/lib/domain/monthly-shift-plan-pdf-table";
import {
  buildMonthlyTraineeShiftStatistics,
  collectTraineeIdsWithAssignmentsInMonth,
} from "@/lib/domain/monthly-trainee-shift-statistics";
import {
  formatShiftPlanPublicationSummaryItalian,
  monthlyShiftPlanStatusLabelItalian,
  type MonthlyShiftPlanRow,
} from "@/lib/domain/monthly-shifts";
import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";
import { buildTraineeWeeklyPlanningSummaries, collectTraineeWeeklySummaryUserIds } from "@/lib/domain/trainee-weekly-planning-summary";
import { buildWeeklyAssistentialLoads } from "@/lib/domain/weekly-assistential-hours";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";

const DAY = (s: string) => s.trim().slice(0, 10);

function conflictNotesByDate(conflicts: PlanningAssistentialConflict[]): Map<string, string> {
  const m = new Map<string, Set<string>>();
  for (const c of conflicts) {
    const d = DAY(c.shiftDate);
    if (!m.has(d)) m.set(d, new Set());
    m.get(d)!.add(`${c.assigneeName}: ${c.shortMessage}`);
  }
  const out = new Map<string, string>();
  for (const [d, set] of m) {
    out.set(d, [...set].join(" | "));
  }
  return out;
}

export type MonthlyPlanExcelBuildParams = {
  plan: MonthlyShiftPlanRow;
  items: ShiftItemRow[];
  monthStart: string;
  monthEnd: string;
  monthLabel: string;
  generatedAtLabel: string;
  nameById: (userId: string) => string;
  phoneById: (userId: string) => string;
  planningLeaves: PlanningLeaveRangeInput[];
  planningBlocks: PlanningBlockInput[];
  /** Ordine display (es. `assigneeOptions.map((o) => o.id)`). */
  assigneeIdsOrdered: string[];
};

export function buildMonthlyPlanExcelBuffer(params: MonthlyPlanExcelBuildParams): Buffer {
  const {
    plan,
    items,
    monthStart,
    monthEnd,
    monthLabel,
    generatedAtLabel,
    nameById,
    phoneById,
    planningLeaves,
    planningBlocks,
    assigneeIdsOrdered,
  } = params;

  const conflicts = buildPlanningAssistentialConflicts({
    items,
    leaves: planningLeaves,
    blocks: planningBlocks,
    nameById,
  });

  const weeklyLoads = buildWeeklyAssistentialLoads(items, nameById);
  const userIdsStats = collectTraineeIdsWithAssignmentsInMonth(
    items,
    monthStart,
    monthEnd,
    assigneeIdsOrdered,
  );

  const statsRows = buildMonthlyTraineeShiftStatistics({
    items,
    monthStart,
    monthEnd,
    conflicts,
    weeklyLoads,
    userIds: userIdsStats,
    nameById,
  });

  const weeklyUserIds = collectTraineeWeeklySummaryUserIds({
    items,
    leaves: planningLeaves,
    blocks: planningBlocks,
    preferredOrder: assigneeIdsOrdered,
  });

  const weeklySummaries = buildTraineeWeeklyPlanningSummaries({
    items,
    leaves: planningLeaves,
    blocks: planningBlocks,
    conflicts,
    nameById,
    monthStart,
    monthEnd,
    userIds: weeklyUserIds,
  });

  const planningPdfRows = buildMonthlyShiftPlanPdfTableRows({
    items,
    monthStart,
    monthEnd,
    nameById,
    phoneById,
  });
  const notesByDate = conflictNotesByDate(conflicts);

  const wb = XLSX.utils.book_new();

  const metaRows: (string | number | boolean)[][] = [
    ["Mese", monthLabel],
    ["Stato piano", monthlyShiftPlanStatusLabelItalian(plan.status)],
    ["Pubblicazione turni", formatShiftPlanPublicationSummaryItalian(plan)],
    ["Generato il", generatedAtLabel],
    [
      "Nota",
      "Ore assistenziali e limite 36h sono calcolati sulle sole righe di questo mese; le settimane a cavallo del mese sono parziali ai bordi.",
    ],
    [],
    ["Giorno", "Mattina", "Pomeriggio", "Reperibilità", "Note / conflitti"],
  ];
  const planningBody = planningPdfRows.map((r) => [
    r.dayLabel,
    r.mattinaLines.join("\n"),
    r.pomeriggioLines.join("\n"),
    r.reperLines.join("\n"),
    notesByDate.get(DAY(r.dateStr)) ?? "",
  ]);
  const planningAoA = [...metaRows, ...planningBody];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(planningAoA), "Planning mensile");

  const statHeader = [
    "Specializzando",
    "Ore assistenziali mese",
    "Mezze giornate assistenziali",
    "Turni mattina",
    "Turni pomeriggio",
    "Giornate intere",
    "Reperibilità",
    "Giorni weekend (sab/dom) con turno",
    "N. conflitti",
    "Settimane >36h (sui dati mese)",
    "Settimana parziale ai bordi mese",
    "Distribuzione (mezze gg. per sala/amb.)",
  ];
  const statBody = statsRows.map((s) => [
    s.userName,
    s.assistentialHoursMonth,
    s.assistentialHalfDays,
    s.morningShifts,
    s.afternoonShifts,
    s.fullDayShifts,
    s.reperShifts,
    s.weekendDaysWorked,
    s.conflictsCount,
    s.weeksOver36HoursCount,
    s.hasPartialWeekAtMonthEdge ? "Sì" : "No",
    s.locationHalfDays.map((l) => `${l.locationLabel}: ${l.halfDays}`).join("; ") || "—",
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([statHeader, ...statBody]),
    "Statistiche specializzandi",
  );

  const weekHeader = [
    "Specializzando",
    "Settimana (lun–dom)",
    "Parziale sul mese",
    "Lun h",
    "Mar h",
    "Mer h",
    "Gio h",
    "Ven h",
    "Sab h",
    "Dom h",
    "Ore assistenziali sett.",
    "Reper (nr.)",
    "Oltre 36h",
    "Conflitti in settimana",
  ];
  const weekRows: (string | number)[][] = [];
  for (const sum of weeklySummaries) {
    for (const w of sum.weeks) {
      const dayHours = w.days.map((d) => (d.isInVisibleMonth ? d.assistentialDayHours : "—"));
      const conflictN = w.days.reduce((n, d) => n + d.conflictMessages.length, 0);
      weekRows.push([
        sum.userName,
        `${w.weekStart} → ${w.weekEnd}`,
        w.partialWeekOutOfMonth ? "Sì" : "No",
        ...dayHours,
        w.totalAssistentialHours,
        w.reperCount,
        w.exceededWeeklyCap ? "Sì" : "No",
        conflictN,
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([weekHeader, ...weekRows]), "Riepilogo settimanale");

  const confHeader = [
    "Data",
    "Specializzando",
    "Turno",
    "Sala / ambulatorio",
    "Attività",
    "Fascia attività",
    "Messaggio",
  ];
  const confBody = conflicts.map((c) => [
    formatDateItalian(c.shiftDate),
    c.assigneeName,
    `${c.shiftKindLabel} · ${c.shiftPeriodLabel}`,
    c.locationLabel,
    c.activityKind,
    c.activityPeriodLabel,
    c.shortMessage,
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([confHeader, ...confBody]), "Conflitti");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(buf);
}
