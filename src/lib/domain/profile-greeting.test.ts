import { describe, expect, it } from "vitest";

import { parseProfileGender, profileDashboardGreetingTitle } from "./profile-greeting";

describe("parseProfileGender", () => {
  it("accetta valori enum e null", () => {
    expect(parseProfileGender(null)).toBeNull();
    expect(parseProfileGender("")).toBeNull();
    expect(parseProfileGender("male")).toBe("male");
    expect(parseProfileGender("prefer_not_to_say")).toBe("prefer_not_to_say");
  });

  it("ignora stringhe non valide", () => {
    expect(parseProfileGender("invalid")).toBeNull();
  });
});

describe("profileDashboardGreetingTitle", () => {
  it("male e female usano Benvenuto/a con virgola", () => {
    expect(profileDashboardGreetingTitle("male", "Gaetano")).toBe("Benvenuto, Gaetano");
    expect(profileDashboardGreetingTitle("female", "Laura")).toBe("Benvenuta, Laura");
  });

  it("altro, prefer_not_to_say e null usano Ciao senza virgola", () => {
    expect(profileDashboardGreetingTitle("other", "Alex")).toBe("Ciao Alex");
    expect(profileDashboardGreetingTitle("prefer_not_to_say", "Gaetano")).toBe("Ciao Gaetano");
    expect(profileDashboardGreetingTitle(null, "Gaetano")).toBe("Ciao Gaetano");
  });

  it("nome vuoto: fallback corto", () => {
    expect(profileDashboardGreetingTitle(null, "  ")).toBe("Ciao utente");
  });
});
