export const ASSEGNAZIONE_SPECIALIZZANDO_VALUES = [
  "rianimazione",
  "sala_base",
  "sala_locoregionale",
  "sala_avanzata",
] as const;

export type AssegnazioneSpecializzando = (typeof ASSEGNAZIONE_SPECIALIZZANDO_VALUES)[number];

export const ASSEGNAZIONE_LABEL_IT: Record<AssegnazioneSpecializzando, string> = {
  rianimazione: "Rianimazione",
  sala_base: "Sala base",
  sala_locoregionale: "Sala loco-regionale",
  sala_avanzata: "Sala avanzata",
};

/** Valore enum (`sala_base`) o etichetta UI italiana (es. «Sala base») → enum DB. */
export function parseAssegnazioneFromForm(raw: string): AssegnazioneSpecializzando | null {
  const t = raw.trim();
  if (!t) return null;
  if ((ASSEGNAZIONE_SPECIALIZZANDO_VALUES as readonly string[]).includes(t)) {
    return t as AssegnazioneSpecializzando;
  }
  const lower = t.toLowerCase();
  for (const [value, label] of Object.entries(ASSEGNAZIONE_LABEL_IT) as [
    AssegnazioneSpecializzando,
    string,
  ][]) {
    if (label.toLowerCase() === lower) return value;
  }
  return null;
}
