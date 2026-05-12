/**
 * Hint non bloccanti per coerenza specializzando ↔ sala/area nel planning mensile.
 */

import type { ShiftItemRow } from "@/lib/domain/monthly-shifts";

export type TraineeLocationCompetencyStatus =
  | "abilitato"
  | "preferenziale"
  | "rotazione"
  | "non_assegnabile";

export type TraineeLocationCompetencyInput = {
  id: string;
  trainee_id: string;
  assignment_location_id: string | null;
  clinical_area_id: string | null;
  status: TraineeLocationCompetencyStatus;
  note: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

export type CompetencyHintSeverity = "positive" | "neutral" | "warning";

export type ShiftItemCompetencyHint = {
  severity: CompetencyHintSeverity;
  /** Stato dominante scelto, se applicabile */
  status: TraineeLocationCompetencyStatus | null;
  shortLabel: string;
  message: string;
};

const DAY = (s: string) => s.trim().slice(0, 10);

/** Competenza valida nel giorno `shiftDateYmd` (inclusi gli estremi). */
export function competencyRowActiveOnDate(
  row: Pick<TraineeLocationCompetencyInput, "starts_on" | "ends_on">,
  shiftDateYmd: string,
): boolean {
  const d = DAY(shiftDateYmd);
  const s = row.starts_on ? DAY(row.starts_on) : null;
  const e = row.ends_on ? DAY(row.ends_on) : null;
  if (s && d < s) return false;
  if (e && d > e) return false;
  return true;
}

/** Sovrappone almeno un giorno del mese [monthStart, monthEnd] (inclusi). */
export function competencyOverlapsMonth(
  row: Pick<TraineeLocationCompetencyInput, "starts_on" | "ends_on">,
  monthStart: string,
  monthEnd: string,
): boolean {
  const ms = DAY(monthStart);
  const me = DAY(monthEnd);
  const s = row.starts_on ? DAY(row.starts_on) : null;
  const e = row.ends_on ? DAY(row.ends_on) : null;
  const effStart = s ?? "0001-01-01";
  const effEnd = e ?? "9999-12-31";
  return effStart <= me && effEnd >= ms;
}

function rowMatchesShiftSlot(
  row: TraineeLocationCompetencyInput,
  item: Pick<ShiftItemRow, "assignment_location_id" | "clinical_area_id" | "kind">,
): boolean {
  if (item.kind === "reperibilita") return false;
  const locOk =
    Boolean(row.assignment_location_id) &&
    Boolean(item.assignment_location_id) &&
    row.assignment_location_id === item.assignment_location_id;
  const areaOk =
    Boolean(row.clinical_area_id) &&
    Boolean(item.clinical_area_id) &&
    row.clinical_area_id === item.clinical_area_id;
  return locOk || areaOk;
}

export function matchingCompetenciesForShiftItem(
  rows: TraineeLocationCompetencyInput[],
  traineeId: string,
  shiftDateYmd: string,
  item: Pick<ShiftItemRow, "assignment_location_id" | "clinical_area_id" | "kind">,
): TraineeLocationCompetencyInput[] {
  return rows.filter(
    (r) =>
      r.trainee_id === traineeId &&
      competencyRowActiveOnDate(r, shiftDateYmd) &&
      rowMatchesShiftSlot(r, item),
  );
}

function hintForStatus(status: TraineeLocationCompetencyStatus): Omit<ShiftItemCompetencyHint, "status"> {
  switch (status) {
    case "non_assegnabile":
      return {
        severity: "warning",
        shortLabel: "non assegnabile",
        message:
          "Segnalato come non assegnabile su questa sala/area: verifica prima di confermare (l’assegnazione resta possibile).",
      };
    case "preferenziale":
      return {
        severity: "positive",
        shortLabel: "preferenziale",
        message: "Preferenziale su questa sala/area.",
      };
    case "rotazione":
      return {
        severity: "positive",
        shortLabel: "in rotazione",
        message: "In rotazione su questa sala/area nel periodo indicato.",
      };
    case "abilitato":
    default:
      return {
        severity: "neutral",
        shortLabel: "abilitato",
        message: "Abilitato su questa sala/area.",
      };
  }
}

/**
 * Priorità: `non_assegnabile` > `preferenziale` > `rotazione` > `abilitato`.
 */
export function pickDominantCompetencyStatus(
  matches: TraineeLocationCompetencyInput[],
): TraineeLocationCompetencyStatus | null {
  if (matches.length === 0) return null;
  if (matches.some((m) => m.status === "non_assegnabile")) return "non_assegnabile";
  if (matches.some((m) => m.status === "preferenziale")) return "preferenziale";
  if (matches.some((m) => m.status === "rotazione")) return "rotazione";
  if (matches.some((m) => m.status === "abilitato")) return "abilitato";
  return null;
}

export function evaluateShiftAssignmentCompetencyHint(params: {
  traineeId: string | null;
  shiftDateYmd: string;
  item: Pick<ShiftItemRow, "assignment_location_id" | "clinical_area_id" | "kind">;
  competencyRows: TraineeLocationCompetencyInput[];
}): ShiftItemCompetencyHint {
  const { traineeId, shiftDateYmd, item, competencyRows } = params;
  if (!traineeId) {
    return {
      severity: "neutral",
      status: null,
      shortLabel: "",
      message: "",
    };
  }
  if (item.kind === "reperibilita") {
    return { severity: "neutral", status: null, shortLabel: "", message: "" };
  }
  if (!item.assignment_location_id && !item.clinical_area_id) {
    return {
      severity: "neutral",
      status: null,
      shortLabel: "",
      message: "Nessuna sala/area tipo collegata allo slot: competenze non applicabili.",
    };
  }

  const matches = matchingCompetenciesForShiftItem(competencyRows, traineeId, shiftDateYmd, item);
  const dominant = pickDominantCompetencyStatus(matches);
  if (!dominant) {
    return {
      severity: "neutral",
      status: null,
      shortLabel: "",
      message: "Nessuna competenza registrata per questa sala/area.",
    };
  }
  const base = hintForStatus(dominant);
  const note = matches.find((m) => m.status === dominant && m.note?.trim())?.note?.trim();
  return {
    status: dominant,
    ...base,
    message: note ? `${base.message} Nota: ${note}` : base.message,
  };
}

/** Codice breve in select: evita righe lunghe con molti specializzandi. */
function competencyCompactCode(status: TraineeLocationCompetencyStatus | null): string {
  switch (status) {
    case "preferenziale":
      return "pref";
    case "rotazione":
      return "rot";
    case "abilitato":
      return "abil";
    case "non_assegnabile":
      return "!";
    default:
      return "";
  }
}

/**
 * Suffisso minimo per `<option>` (es. ` ·pref`) + `optionTitle` per tooltip nativo al passaggio del mouse.
 */
export function competencySelectOptionMeta(
  rows: TraineeLocationCompetencyInput[],
  traineeId: string,
  shiftDateYmd: string,
  item: Pick<ShiftItemRow, "assignment_location_id" | "clinical_area_id" | "kind">,
): { suffix: string; optionTitle?: string } {
  if (item.kind === "reperibilita") return { suffix: "" };
  const hint = evaluateShiftAssignmentCompetencyHint({
    traineeId,
    shiftDateYmd,
    item,
    competencyRows: rows,
  });
  const code = competencyCompactCode(hint.status);
  if (!code) return { suffix: "" };
  const suffix = ` ·${code}`;
  const optionTitle =
    hint.message.trim().length > 0
      ? `${hint.shortLabel ? `${hint.shortLabel}: ` : ""}${hint.message}`.trim()
      : undefined;
  return { suffix, optionTitle };
}
