import { describe, expect, it } from "vitest";

import { canEditAssignmentsByPlanAndRole, humanizePostgrestRlsError } from "./shift-rules";

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
