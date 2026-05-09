/** Compat schema `profiles`: `nome`/`cognome` oppure legacy `full_name`. */
export function nomeCognomeFromProfileRow(row: Record<string, unknown>): { nome: string; cognome: string } {
  const nomeRaw = typeof row.nome === "string" ? row.nome.trim() : "";
  const cognomeRaw = typeof row.cognome === "string" ? row.cognome.trim() : "";
  if (nomeRaw || cognomeRaw) return { nome: nomeRaw, cognome: cognomeRaw };
  const full = typeof row.full_name === "string" ? row.full_name.trim() : "";
  if (!full) return { nome: "", cognome: "" };
  const parts = full.split(/\s+/).filter(Boolean);
  return { nome: parts[0] ?? "", cognome: parts.slice(1).join(" ") };
}

/** Etichetta unica UI senza campo duplicato in DB tipo `full_name`. */
export function profileDisplayName(parts: {
  nome?: string | null;
  cognome?: string | null;
  email?: string | null;
}): string {
  const nome = parts.nome?.trim() ?? "";
  const cognome = parts.cognome?.trim() ?? "";
  const combined = `${nome} ${cognome}`.trim();
  if (combined) return combined;
  return parts.email?.trim() ?? "";
}
