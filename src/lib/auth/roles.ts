export const appRoles = [
  "specializzando",
  "addetto_turni",
  "amministratore",
  "tutor_strutturato",
] as const;

export type AppRole = (typeof appRoles)[number];

export const roleLabels: Record<AppRole, string> = {
  specializzando: "Specializzando",
  addetto_turni: "Addetto turni",
  amministratore: "Amministratore",
  tutor_strutturato: "Tutor / Strutturato",
};
