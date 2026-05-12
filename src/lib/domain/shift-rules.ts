/**
 * Regole e indicatori per turnistica mensile (`shift_items` + `monthly_shift_plans`).
 */

import { eachDayOfInterval, endOfMonth, format, getISODay, isWeekend, startOfMonth } from "date-fns";

import type { MonthlyShiftPlanStatus, ShiftItemPeriod, ShiftItemRow } from "./monthly-shifts";

type EditorRole = "specializzando" | "tutor" | "admin";

/** Assegnazioni: draft/submitted → solo admin; approved → nessuno; tutor → no; specializzando → no (planning interno). */
export function canEditAssignmentsByPlanAndRole(planStatus: MonthlyShiftPlanStatus, role: EditorRole): boolean {
  if (role === "tutor") return false;
  if (role === "specializzando") return false;
  if (planStatus === "approved") return false;
  if (planStatus === "submitted") return role === "admin";
  if (planStatus === "draft") return role === "admin";
  return false;
}

/**
 * Parti di giornata assistenziale (sala/amb) coperte dal `period` della riga.
 * `giornata` occupa mattina e pomeriggio; `reperibilita` su fascia (dato anomalo) si tratta come giornata intera.
 */
export function assistentialOccupiedDayParts(period: ShiftItemPeriod): ("mattina" | "pomeriggio")[] {
  switch (period) {
    case "mattina":
      return ["mattina"];
    case "pomeriggio":
      return ["pomeriggio"];
    case "giornata":
      return ["mattina", "pomeriggio"];
    case "reperibilita":
      return ["mattina", "pomeriggio"];
    default:
      return ["mattina", "pomeriggio"];
  }
}

function countAssistentialPartOverlaps(rows: ShiftItemRow[]): { mattina: number; pomeriggio: number } {
  let mattina = 0;
  let pomeriggio = 0;
  for (const r of rows) {
    if (r.kind !== "sala" && r.kind !== "ambulatorio") continue;
    for (const p of assistentialOccupiedDayParts(r.period)) {
      if (p === "mattina") mattina += 1;
      else pomeriggio += 1;
    }
  }
  return { mattina, pomeriggio };
}

/**
 * Nello stesso giorno, per la stessa persona:
 * - sala: consentite mattina + pomeriggio (12h); vietate due mattine, due pomeriggi, giornata con mezze incompatibili.
 * - ambulatorio: stessa logica sulle fasce.
 * - non mescolare sala e ambulatorio.
 * - la reperibilità (`kind`) non entra in questa regola.
 */
export function validateSalaAmbSameDay(
  currentRow: ShiftItemRow,
  otherRowsSameDaySameUser: ShiftItemRow[],
):
  | { ok: true }
  | { ok: false; error: string; conflictItemIds: string[] } {
  const allRows = [...otherRowsSameDaySameUser, currentRow];
  const conflictItemIds = () => otherRowsSameDaySameUser.map((r) => r.id);

  let sala = 0;
  let amb = 0;
  for (const r of otherRowsSameDaySameUser) {
    if (r.kind === "sala") sala += 1;
    if (r.kind === "ambulatorio") amb += 1;
  }
  if (currentRow.kind === "sala") sala += 1;
  if (currentRow.kind === "ambulatorio") amb += 1;
  if (sala >= 1 && amb >= 1) {
    return {
      ok: false,
      error: "Nello stesso giorno non si possono assegnare sia sala sia ambulatorio alla stessa persona.",
      conflictItemIds: conflictItemIds(),
    };
  }

  /** La reper non occupa fasce assistenziali: non applicare qui il vincolo doppia mattina/pomeriggio. */
  if (currentRow.kind === "reperibilita") {
    return { ok: true };
  }

  const assistentialKind: ShiftItemRow["kind"] | null =
    currentRow.kind === "sala" || currentRow.kind === "ambulatorio"
      ? currentRow.kind
      : otherRowsSameDaySameUser.some((r) => r.kind === "sala")
        ? "sala"
        : otherRowsSameDaySameUser.some((r) => r.kind === "ambulatorio")
          ? "ambulatorio"
          : null;

  if (assistentialKind == null) {
    return { ok: true };
  }

  const sameKindRows = allRows.filter((r) => r.kind === assistentialKind);
  const { mattina: m, pomeriggio: p } = countAssistentialPartOverlaps(sameKindRows);
  if (m > 1 || p > 1) {
    const dove = assistentialKind === "sala" ? "in sala" : "in ambulatorio";
    let detail: string;
    if (m > 1 && p > 1) {
      detail = `più turni ${dove} che ricoprono mattina e pomeriggio (inclusa una giornata intera se presente).`;
    } else if (m > 1) {
      detail = `più turni ${dove} in mattina, oppure una giornata intera insieme a un altro impegno in mattina.`;
    } else {
      detail = `più turni ${dove} in pomeriggio, oppure una giornata intera insieme a un altro impegno in pomeriggio.`;
    }
    return {
      ok: false,
      error: `In questa data la stessa fascia oraria risulta già occupata ${dove}: ${detail} Mattina e pomeriggio distinti nello stesso giorno sono consentiti.`,
      conflictItemIds: conflictItemIds(),
    };
  }

  return { ok: true };
}

export type UserLoadLine = {
  userId: string;
  displayName: string;
  /** Turni assistenziali (sala + ambulatorio); esclusa la reperibilità dal monte “carico” turni. */
  total: number;
  mattine: number;
  pomeriggi: number;
  ambulatorio: number;
  reper: number;
  /** Reper su sab/domenica (e festivi in calendario, se il turno cade in weekend) */
  weekendReper: number;
};

function isSatSunYmd(ymd: string): boolean {
  const w = getISODay(new Date(ymd + "T12:00:00"));
  return w === 6 || w === 7;
}

/** Riepilogo carico per ogni assegnatario (solo righe con `assigned_to` valorizzato). */
export function buildUserLoadLines(
  items: ShiftItemRow[],
  nameById: (id: string) => string,
): UserLoadLine[] {
  const by = new Map<string, UserLoadLine>();

  for (const i of items) {
    if (!i.assigned_to) continue;
    const id = i.assigned_to;
    if (!by.has(id)) {
      by.set(id, {
        userId: id,
        displayName: nameById(id),
        total: 0,
        mattine: 0,
        pomeriggi: 0,
        ambulatorio: 0,
        reper: 0,
        weekendReper: 0,
      });
    }
    const u = by.get(id)!;
    if (i.kind === "reperibilita") {
      u.reper += 1;
      if (isSatSunYmd(i.shift_date)) u.weekendReper += 1;
    } else {
      u.total += 1;
      if (i.kind === "sala" && i.period === "mattina") u.mattine += 1;
      if (i.kind === "sala" && i.period === "pomeriggio") u.pomeriggi += 1;
      if (i.kind === "ambulatorio") u.ambulatorio += 1;
    }
  }

  return Array.from(by.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, "it"));
}

/** Avvisi non bloccanti su distribuzione. */
export function computeLoadWarnings(lines: UserLoadLine[]): string[] {
  const w: string[] = [];
  if (lines.length < 2) return w;

  const withAssistenziali = lines.filter((l) => l.total > 0);
  if (withAssistenziali.length < 2) return w;

  const totals = withAssistenziali.map((l) => l.total);
  const maxT = Math.max(...totals);
  const minT = Math.min(...totals);
  if (maxT - minT >= 4) {
    w.push(
      "Scarto elevato tra carico assistenziale (sala/ambulatorio, escl. reper): verifica l’equilibrio assegnazioni tra colleghi.",
    );
  }

  for (const l of withAssistenziali) {
    if (l.total >= 3 && l.pomeriggi / l.total > 0.55) {
      w.push(
        `Possibile eccesso pomeriggi per ${l.displayName} (${l.pomeriggi}/${l.total} turni): controlla la rotazione.`,
      );
    }
  }

  const reperLines = lines.filter((l) => l.weekendReper > 0);
  if (reperLines.length >= 2) {
    const rs = reperLines.map((l) => l.weekendReper);
    if (Math.max(...rs) - Math.min(...rs) >= 2) {
      w.push("Reper weekend: distribuzione poco equa tra le persone con almeno una reper in sabato o domenica.");
    }
  }

  return w;
}

/** Giorni feriali del mese (lun–ven) che non hanno alcun turno in sala. Anno/mese 1–12. */
export function findWeekdayDatesWithoutSalaInMonth(
  year: number,
  month: number,
  salaItems: { shift_date: string; kind: string }[],
): string[] {
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  const withSala = new Set(salaItems.filter((i) => i.kind === "sala").map((i) => i.shift_date.slice(0, 10)));
  const out: string[] = [];
  for (const d of eachDayOfInterval({ start, end })) {
    if (isWeekend(d)) continue;
    const ymd = format(d, "yyyy-MM-dd");
    if (!withSala.has(ymd)) out.push(ymd);
  }
  return out;
}

/** Chiavi duplicate: stessa data, fascia (mattina/pomeriggio) e stessa `assignment_location_id` se presente, altrimenti `room_name`. */
export function findDuplicateSalaSlotKeys(
  salaItems: {
    shift_date: string;
    kind: string;
    room_name: string | null;
    period: string;
    assignment_location_id?: string | null;
  }[],
): string[] {
  const counts = new Map<string, number>();
  for (const i of salaItems) {
    if (i.kind !== "sala") continue;
    const slotKey =
      i.assignment_location_id && String(i.assignment_location_id).length > 0
        ? `loc:${i.assignment_location_id}`
        : `room:${(i.room_name ?? "").trim() || "?"}`;
    const k = `${i.shift_date}|${i.period}|${slotKey}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const dups: string[] = [];
  counts.forEach((c, k) => {
    if (c > 1) dups.push(`${k} (×${c})`);
  });
  return dups;
}

/** Giorni del mese in cui **non c’è alcuna** voce in `all` (né sala, né amb., né reper.). */
export function findDatesInMonthCompletelyEmpty(
  year: number,
  month: number,
  items: { shift_date: string }[],
): string[] {
  const withAny = new Set(items.map((i) => i.shift_date.trim().slice(0, 10)));
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfMonth(start);
  const out: string[] = [];
  for (const d of eachDayOfInterval({ start, end })) {
    const ymd = format(d, "yyyy-MM-dd");
    if (!withAny.has(ymd)) out.push(ymd);
  }
  return out;
}

/**
 * Messaggio comprensibile per l’utente a partire da errori Postgrest/RLS in italiano o inglese.
 */
export function humanizePostgrestRlsError(message: string): string {
  if (/nessuna riga aggiornata|nessuna riga modificata/i.test(message)) {
    return "Il salvataggio non ha aggiornato il turno. Accedi come amministratore attivo, verifica che la riga esista e che le policy RLS sul database siano allineate (db push).";
  }
  if (/row-level security|RLS|row-level|violates policy|policy (?:for|violation)/i.test(message)) {
    return "Non hai permessi per modificare questo turno. Verifica il ruolo e lo stato del piano mese (es. inviato = solo amministrazione).";
  }
  if (/permission denied|not authorized|unauthorized/i.test(message)) {
    return "Operazione non consentita con il tuo profilo.";
  }
  if (/null value|violates not-null|not null constraint/i.test(message)) {
    return "Dati obbligatori mancanti.";
  }
  return message;
}

/** Alias per aderire al naming condiviso con il resto del team. */
export { canEditAssignmentsByPlanAndRole as canAssignShift, validateSalaAmbSameDay as validateAssignment };
