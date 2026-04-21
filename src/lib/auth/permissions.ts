import type { AppRole } from "@/lib/auth/roles";

type AppSection =
  | "dashboard"
  | "turni"
  | "turni-ferie"
  | "ferie"
  | "universita"
  | "archivio"
  | "logbook"
  | "report"
  | "admin";

const permissionMatrix: Record<AppRole, AppSection[]> = {
  specializzando: ["dashboard", "turni", "turni-ferie", "ferie", "universita", "archivio", "logbook", "report"],
  tutor: ["dashboard", "turni", "turni-ferie", "ferie", "universita", "archivio", "logbook", "report"],
  admin: ["dashboard", "turni", "turni-ferie", "ferie", "universita", "archivio", "logbook", "report", "admin"],
};

export function canAccess(role: AppRole, section: AppSection) {
  const allowedSections = permissionMatrix[role];
  if (!Array.isArray(allowedSections)) return false;
  return allowedSections.includes(section);
}
