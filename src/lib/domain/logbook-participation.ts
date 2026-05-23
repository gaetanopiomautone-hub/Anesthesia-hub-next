export const LOGBOOK_PARTICIPATION_ROLE_VALUES = [
  "osservato",
  "assistito",
  "eseguito_supervisionato",
  "eseguito_autonomamente",
] as const;

export type LogbookParticipationRole = (typeof LOGBOOK_PARTICIPATION_ROLE_VALUES)[number];

export const LOGBOOK_PARTICIPATION_ROLE_LABEL_IT: Record<LogbookParticipationRole, string> = {
  osservato: "Osservato",
  assistito: "Assistito",
  eseguito_supervisionato: "Eseguito supervisionato",
  eseguito_autonomamente: "Eseguito autonomamente",
};

export function participationRoleLabel(role: LogbookParticipationRole | string): string {
  if ((LOGBOOK_PARTICIPATION_ROLE_VALUES as readonly string[]).includes(role)) {
    return LOGBOOK_PARTICIPATION_ROLE_LABEL_IT[role as LogbookParticipationRole];
  }
  return role;
}

/** Migrazione da enum legacy supervisione/autonomia. */
export function participationRoleFromLegacy(params: {
  supervision_level: string;
  autonomy_level: string;
}): LogbookParticipationRole {
  if (params.autonomy_level === "autonomo") return "eseguito_autonomamente";
  if (params.autonomy_level === "con_supervisione") return "eseguito_supervisionato";
  if (params.autonomy_level === "assistito") return "assistito";
  if (params.supervision_level === "assente") return "eseguito_autonomamente";
  return "osservato";
}
