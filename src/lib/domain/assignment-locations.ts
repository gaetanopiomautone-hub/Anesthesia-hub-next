/** Catalogo sale / attività per righe `shift_items` (planning mensile). */

export type AssignmentLocationKind =
  | "sala"
  | "ambulatorio"
  | "didattica"
  | "ferie"
  | "congresso"
  | "altro";

export type AssignmentLocationRow = {
  id: string;
  name: string;
  kind: AssignmentLocationKind;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Estensioni future: ore verso tetto settimanale per `ferie` / `congresso` / `reperibilità`. */
export function assignmentLocationKindCountsWeeklyHours(kind: AssignmentLocationKind): boolean {
  return kind === "sala" || kind === "ambulatorio" || kind === "didattica" || kind === "altro";
}

export function assignmentLocationKindLabelItalian(k: AssignmentLocationKind) {
  switch (k) {
    case "sala":
      return "Sala";
    case "ambulatorio":
      return "Ambulatorio";
    case "didattica":
      return "Didattica";
    case "ferie":
      return "Ferie";
    case "congresso":
      return "Congresso";
    case "altro":
      return "Altro";
    default:
      return k;
  }
}
