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
