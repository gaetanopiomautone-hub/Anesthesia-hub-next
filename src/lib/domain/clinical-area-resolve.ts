import type { ShiftItemDraft } from "@/lib/import/planning-parser";

export type ClinicalAreaLookup = { id: string; code: string; name: string };

/** Confronto normalizzato per codice o nome visualizzato (solo aree attive passate dal chiamante). */
export function resolveClinicalAreaIdFromSalaDraft(
  draft: Pick<ShiftItemDraft, "kind" | "specialty" | "room_name" | "label">,
  areas: ClinicalAreaLookup[],
): string | null {
  if (draft.kind !== "sala" || areas.length === 0) return null;

  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const a of areas) {
    byCode.set(a.code.trim().toLowerCase(), a.id);
    byName.set(a.name.trim().toLowerCase(), a.id);
  }

  const tryMatch = (raw: string | null | undefined): string | null => {
    if (raw == null) return null;
    const t = raw.trim();
    if (!t) return null;
    const lower = t.toLowerCase();
    const underscored = lower.replace(/\s+/g, "_");
    const compact = lower.replace(/\s+/g, "");
    return (
      byCode.get(lower) ??
      byCode.get(underscored) ??
      byCode.get(compact) ??
      byName.get(lower) ??
      null
    );
  };

  return tryMatch(draft.specialty) ?? tryMatch(draft.room_name) ?? tryMatch(draft.label);
}
