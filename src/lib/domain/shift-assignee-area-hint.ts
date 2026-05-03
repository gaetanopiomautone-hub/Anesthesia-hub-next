import type { AssignableShiftUserOption } from "@/lib/data/shifts";

/**
 * Raggruppa gli assegnabili per suggerimento soft: `specializzandi_profiles.assegnazione` vs codice area turno (`clinical_areas.code`).
 * Nessun filtro rigido: chi non è in “Suggeriti” resta disponibile sotto “Altri”.
 */
export function groupAssigneesByClinicalAreaHint(
  options: AssignableShiftUserOption[],
  clinicalAreaCode: string | null | undefined,
): {
  useGroupedSelect: boolean;
  suggested: AssignableShiftUserOption[];
  others: AssignableShiftUserOption[];
} {
  const code = clinicalAreaCode?.trim();
  if (!code) {
    return { useGroupedSelect: false, suggested: [], others: options };
  }

  const suggested = options.filter((o) => o.assegnazione === code);
  if (suggested.length === 0) {
    return { useGroupedSelect: false, suggested: [], others: options };
  }

  const pick = new Set(suggested.map((s) => s.id));
  const others = options.filter((o) => !pick.has(o.id));

  return { useGroupedSelect: true, suggested, others };
}
