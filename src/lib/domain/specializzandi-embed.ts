export type SpecializzandiEmbedRow = {
  anno_specialita: number;
  assegnazione: string;
};

/** Embedding PostgREST `specializzandi_profiles (...)` sul profilo. */
export function pickSpecializzandiProfilesEmbed(raw: unknown): SpecializzandiEmbedRow | null {
  if (raw == null) return null;
  const obj = Array.isArray(raw) ? raw[0] : raw;
  if (!obj || typeof obj !== "object") return null;
  const row = obj as { anno_specialita?: unknown; assegnazione?: unknown };
  const anno = typeof row.anno_specialita === "number" ? row.anno_specialita : Number(row.anno_specialita);
  const assegnazione = typeof row.assegnazione === "string" ? row.assegnazione : null;
  if (!Number.isFinite(anno) || !assegnazione) return null;
  return { anno_specialita: anno as number, assegnazione };
}
