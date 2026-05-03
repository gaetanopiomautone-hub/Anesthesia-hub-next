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
