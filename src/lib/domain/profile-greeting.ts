/**
 * Saluto dashboard da `profiles.gender` (nessuna inferenza dal nome).
 */

export const PROFILE_GENDER_VALUES = ["male", "female", "other", "prefer_not_to_say"] as const;

export type ProfileGenderStored = (typeof PROFILE_GENDER_VALUES)[number];

/** Valore letto da DB: null = non impostato → saluto neutro. */
export type ProfileGender = ProfileGenderStored | null;

export const PROFILE_GENDER_UI_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Non indicato — saluto neutro (Ciao …)" },
  { value: "male", label: "Maschio — Benvenuto, …" },
  { value: "female", label: "Femmina — Benvenuta, …" },
  { value: "other", label: "Altro — Ciao …" },
  { value: "prefer_not_to_say", label: "Preferisco non dirlo — Ciao …" },
];

export function parseProfileGender(raw: unknown): ProfileGender {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  return (PROFILE_GENDER_VALUES as readonly string[]).includes(s) ? (s as ProfileGenderStored) : null;
}

/**
 * `displayName` di solito il nome proprio; in fallback `full_name` dal profilo.
 * - male → «Benvenuto, …»
 * - female → «Benvenuta, …»
 * - altro / non indicato → «Ciao …» (formula neutra, senza virgola)
 */
export function profileDashboardGreetingTitle(gender: ProfileGender, displayName: string): string {
  const name = displayName.trim() || "utente";
  if (gender === "male") return `Benvenuto, ${name}`;
  if (gender === "female") return `Benvenuta, ${name}`;
  return `Ciao ${name}`;
}
