import { describe, expect, it } from "vitest";

import type { ShiftItemRow } from "./monthly-shifts";

import {
  assistentialOccupiedDayParts,
  canEditAssignmentsByPlanAndRole,
  humanizePostgrestRlsError,
  validateSalaAmbSameDay,
} from "./shift-rules";

function baseRow(partial: Partial<ShiftItemRow> & Pick<ShiftItemRow, "id" | "kind" | "period">): ShiftItemRow {
  return {
    plan_id: "plan-1",
    shift_date: "2026-05-12",
    start_time: null,
    end_time: null,
    label: "Test",
    room_name: null,
    specialty: null,
    clinical_area_id: null,
    clinical_area: null,
    assignment_location_id: null,
    assignment_location: null,
    notes: null,
    source: "manual",
    assigned_to: "user-1",
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("humanizePostgrestRlsError", () => {
  it("traduce il messaggio di update senza righe toccate", () => {
    expect(
      humanizePostgrestRlsError(
        "Nessuna riga aggiornata: permessi RLS, riga inesistente, o sessione non riconosciuta come amministratore attivo.",
      ),
    ).toMatch(/salvataggio non ha aggiornato il turno/i);
  });

  it("mantiene messaggio RLS generico", () => {
    expect(humanizePostgrestRlsError("new row violates row-level security policy")).toMatch(/permessi/i);
  });
});

describe("canEditAssignmentsByPlanAndRole", () => {
  it("solo admin in bozza o inviato; specializzando mai", () => {
    expect(canEditAssignmentsByPlanAndRole("draft", "admin")).toBe(true);
    expect(canEditAssignmentsByPlanAndRole("submitted", "admin")).toBe(true);
    expect(canEditAssignmentsByPlanAndRole("draft", "specializzando")).toBe(false);
    expect(canEditAssignmentsByPlanAndRole("submitted", "specializzando")).toBe(false);
    expect(canEditAssignmentsByPlanAndRole("draft", "tutor")).toBe(false);
    expect(canEditAssignmentsByPlanAndRole("approved", "admin")).toBe(false);
  });
});

describe("assistentialOccupiedDayParts", () => {
  it("mattina e pomeriggio sono singole fasce; giornata copre entrambe", () => {
    expect(assistentialOccupiedDayParts("mattina")).toEqual(["mattina"]);
    expect(assistentialOccupiedDayParts("pomeriggio")).toEqual(["pomeriggio"]);
    expect(assistentialOccupiedDayParts("giornata")).toEqual(["mattina", "pomeriggio"]);
  });
});

describe("validateSalaAmbSameDay", () => {
  it("consente mattina + pomeriggio in sala lo stesso giorno", () => {
    const mattina = baseRow({ id: "a", kind: "sala", period: "mattina" });
    const pomeriggio = baseRow({ id: "b", kind: "sala", period: "pomeriggio" });
    expect(validateSalaAmbSameDay(pomeriggio, [mattina]).ok).toBe(true);
    expect(validateSalaAmbSameDay(mattina, [pomeriggio]).ok).toBe(true);
  });

  it("vieta due mattine in sala", () => {
    const first = baseRow({ id: "a", kind: "sala", period: "mattina" });
    const second = baseRow({ id: "b", kind: "sala", period: "mattina" });
    const r = validateSalaAmbSameDay(second, [first]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mattina/i);
  });

  it("vieta due pomeriggi in sala", () => {
    const first = baseRow({ id: "a", kind: "sala", period: "pomeriggio" });
    const second = baseRow({ id: "b", kind: "sala", period: "pomeriggio" });
    expect(validateSalaAmbSameDay(second, [first]).ok).toBe(false);
  });

  it("vieta giornata intera + mattina in sala", () => {
    const giornata = baseRow({ id: "a", kind: "sala", period: "giornata" });
    const mattina = baseRow({ id: "b", kind: "sala", period: "mattina" });
    expect(validateSalaAmbSameDay(mattina, [giornata]).ok).toBe(false);
    expect(validateSalaAmbSameDay(giornata, [mattina]).ok).toBe(false);
  });

  it("vieta giornata + pomeriggio in sala", () => {
    const giornata = baseRow({ id: "a", kind: "sala", period: "giornata" });
    const pomeriggio = baseRow({ id: "b", kind: "sala", period: "pomeriggio" });
    expect(validateSalaAmbSameDay(pomeriggio, [giornata]).ok).toBe(false);
  });

  it("consente assistenziale + reperibilità", () => {
    const mattina = baseRow({ id: "a", kind: "sala", period: "mattina" });
    const reper = baseRow({ id: "b", kind: "reperibilita", period: "reperibilita" });
    expect(validateSalaAmbSameDay(reper, [mattina]).ok).toBe(true);
    const pom = baseRow({ id: "c", kind: "sala", period: "pomeriggio" });
    expect(validateSalaAmbSameDay(pom, [mattina, reper]).ok).toBe(true);
  });

  it("vieta sala e ambulatorio lo stesso giorno", () => {
    const sala = baseRow({ id: "a", kind: "sala", period: "mattina" });
    const amb = baseRow({ id: "b", kind: "ambulatorio", period: "pomeriggio" });
    expect(validateSalaAmbSameDay(amb, [sala]).ok).toBe(false);
  });

  it("applica la stessa logica alle fasce in ambulatorio", () => {
    const m1 = baseRow({ id: "a", kind: "ambulatorio", period: "mattina" });
    const m2 = baseRow({ id: "b", kind: "ambulatorio", period: "mattina" });
    expect(validateSalaAmbSameDay(m2, [m1]).ok).toBe(false);
    const p = baseRow({ id: "c", kind: "ambulatorio", period: "pomeriggio" });
    expect(validateSalaAmbSameDay(p, [m1]).ok).toBe(true);
  });
});
