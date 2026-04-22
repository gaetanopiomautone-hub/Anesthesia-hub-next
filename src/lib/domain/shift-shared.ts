export type ShiftType = "mattina" | "pomeriggio" | "notte";
export type ShiftStatus = "draft" | "submitted" | "approved" | "rejected";

export type ShiftRow = {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  user_id: string | null;
  status?: ShiftStatus | null;
  proposed_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  assignee: { id: string; full_name: string | null; email: string | null } | null;
  proposer?: { id: string; full_name: string | null; email: string | null } | null;
};

export function normalizeShiftStatus(value: unknown): ShiftStatus {
  if (value === "draft" || value === "submitted" || value === "approved" || value === "rejected") {
    return value;
  }
  return "draft";
}

export function shiftStatusLabelItalian(status?: ShiftStatus | null): string {
  switch (status) {
    case "draft":
      return "Bozza";
    case "submitted":
      return "Da validare";
    case "approved":
      return "Approvato";
    case "rejected":
      return "Respinto";
    default:
      return "Bozza";
  }
}

export function shiftTypeLabelItalian(shiftType: ShiftType | string | null | undefined) {
  const value = String(shiftType ?? "").trim();
  switch (value as ShiftType) {
    case "mattina":
      return "Mattina";
    case "pomeriggio":
      return "Pomeriggio";
    case "notte":
      return "Notte";
    default:
      return value || "—";
  }
}

export function assigneeLabel(shift: ShiftRow) {
  const fullName = shift.assignee?.full_name?.trim();
  const email = shift.assignee?.email?.trim();
  if (fullName && email) return `${fullName} · ${email}`;
  if (fullName) return fullName;
  if (email) return email;
  return "Non assegnato";
}
