/** Modello turnistica mensile (tabelle `monthly_shift_plans` + `shift_items`). */

import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

import type { AssignmentLocationKind } from "@/lib/domain/assignment-locations";

export type MonthlyShiftPlanStatus = "draft" | "submitted" | "approved";

export type ShiftItemKind = "sala" | "ambulatorio" | "reperibilita";

export type ShiftItemPeriod = "mattina" | "pomeriggio" | "giornata" | "reperibilita";

export type ShiftItemSource = "excel" | "generated" | "manual";

export type MonthlyShiftPlanRow = {
  id: string;
  year: number;
  month: number;
  status: MonthlyShiftPlanStatus;
  created_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reopened_at: string | null;
  /** Ufficializzazione al reparto (solo con `status === "approved"`). */
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Solo per UI specializzando prima della pubblicazione (RLS non espone il piano reale). */
export function syntheticMonthlyShiftPlanForPrepublishShell(params: {
  id: string;
  year: number;
  month: number;
  status: MonthlyShiftPlanStatus;
}): MonthlyShiftPlanRow {
  return {
    id: params.id,
    year: params.year,
    month: params.month,
    status: params.status,
    created_by: null,
    submitted_at: null,
    approved_by: null,
    approved_at: null,
    reopened_at: null,
    published_at: null,
    published_by: null,
    created_at: "",
    updated_at: "",
  };
}

/** Turni “pubblicati” per il reparto: approvazione + passaggio esplicito pubblica. */
export function isMonthlyShiftsPublished(plan: MonthlyShiftPlanRow): boolean {
  return plan.status === "approved" && Boolean(plan.published_at?.trim());
}

/** Testo unico per PDF / export (stesso significato del foglio Excel). */
export function formatShiftPlanPublicationLineItalian(plan: MonthlyShiftPlanRow): string {
  if (!isMonthlyShiftsPublished(plan) || !plan.published_at?.trim()) {
    return "Pubblicazione: non ancora pubblicato";
  }
  const d = parseISO(plan.published_at);
  if (Number.isNaN(d.getTime())) {
    return "Pubblicazione: non ancora pubblicato";
  }
  const day = format(d, "dd/MM/yyyy", { locale: it });
  const time = format(d, "HH:mm", { locale: it });
  return `Pubblicazione: pubblicato il ${day} alle ${time}`;
}

/** Testo dopo «Pubblicazione:» (es. colonna Excel accanto a «Pubblicazione turni»). */
export function formatShiftPlanPublicationSummaryItalian(plan: MonthlyShiftPlanRow): string {
  return formatShiftPlanPublicationLineItalian(plan).replace(/^Pubblicazione:\s*/i, "");
}

export type ShiftItemRow = {
  id: string;
  plan_id: string;
  shift_date: string;
  kind: ShiftItemKind;
  period: ShiftItemPeriod;
  start_time: string | null;
  end_time: string | null;
  label: string;
  room_name: string | null;
  specialty: string | null;
  /** Area tipo turno (FK `clinical_areas`); opzionale durante il rollout. */
  clinical_area_id: string | null;
  /** Popolato quando si legge con join `clinical_areas` (storico: anche aree disattivate). */
  clinical_area: {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
  } | null;
  assignment_location_id: string | null;
  /** Join `assignment_locations` (sale / attività planning). */
  assignment_location: {
    id: string;
    name: string;
    kind: AssignmentLocationKind;
    is_active: boolean;
  } | null;
  notes: string | null;
  source: ShiftItemSource;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

/** Area clinica (primaria) e sala/attività (secondaria) per etichette planning. */
export function shiftItemLocationParts(
  item: Pick<ShiftItemRow, "clinical_area" | "specialty" | "assignment_location" | "room_name" | "label">,
): { primary: string; secondary: string | null } {
  const area = item.clinical_area?.name?.trim() || item.specialty?.trim() || null;
  const room =
    item.assignment_location?.name?.trim() ||
    item.room_name?.trim() ||
    null;
  if (area && room && room !== area) {
    return { primary: area, secondary: room };
  }
  if (area) {
    return { primary: area, secondary: null };
  }
  if (room) {
    return { primary: room, secondary: null };
  }
  const fallback = item.label?.trim();
  return { primary: fallback || "—", secondary: null };
}

/** Es. «Ortopedia · Sala 2» — area clinica prima, sala/attività dopo. */
export function formatShiftItemPlanningLocation(
  item: Pick<ShiftItemRow, "clinical_area" | "specialty" | "assignment_location" | "room_name" | "label">,
): string {
  const { primary, secondary } = shiftItemLocationParts(item);
  return secondary ? `${primary} · ${secondary}` : primary;
}

export function monthlyShiftPlanStatusLabelItalian(s: MonthlyShiftPlanStatus) {
  switch (s) {
    case "draft":
      return "Bozza";
    case "submitted":
      return "Inviata";
    case "approved":
      return "Approvata";
    default:
      return s;
  }
}

export function shiftItemKindLabelItalian(k: ShiftItemKind) {
  switch (k) {
    case "sala":
      return "Sala";
    case "ambulatorio":
      return "Ambulatorio";
    case "reperibilita":
      return "Reperibilità";
    default:
      return k;
  }
}

export function shiftItemSourceLabelItalian(s: ShiftItemSource) {
  switch (s) {
    case "excel":
      return "Excel";
    case "manual":
      return "Manuale";
    default:
      return "Generato";
  }
}

export function shiftItemPeriodLabelItalian(p: ShiftItemPeriod) {
  switch (p) {
    case "mattina":
      return "Mattina";
    case "pomeriggio":
      return "Pomeriggio";
    case "giornata":
      return "Giornata";
    case "reperibilita":
      return "Reperibilità";
    default:
      return p;
  }
}
