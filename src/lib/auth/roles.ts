export const appRoles = [
  "specializzando",
  "tutor",
  "admin",
] as const;

export type AppRole = (typeof appRoles)[number];

export const roleLabels: Record<AppRole, string> = {
  specializzando: "Specializzando",
  tutor: "Tutor",
  admin: "admin",
};