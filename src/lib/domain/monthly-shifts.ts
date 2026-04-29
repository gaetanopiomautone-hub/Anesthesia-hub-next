/** Modello turnistica mensile (tabelle `monthly_shift_plans` + `shift_items`). */

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
  created_at: string;
  updated_at: string;
};

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
  source: ShiftItemSource;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

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
