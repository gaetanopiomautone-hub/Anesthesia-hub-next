import type { AppRole } from "@/lib/auth/roles";

type AppSection =
  | "dashboard"
  | "profilo"
  | "turni"
  | "ferie"
  | "universita"
  | "archivio"
  | "logbook"
  | "report"
  | "admin";

const permissionMatrix: Record<AppRole, AppSection[]> = {
  specializzando: ["dashboard", "profilo", "turni", "ferie", "universita", "logbook", "report"],
  tutor: ["dashboard", "profilo", "turni", "ferie", "universita", "archivio", "logbook", "report"],
  admin: ["dashboard", "profilo", "turni", "ferie", "universita", "archivio", "logbook", "report", "admin"],
};

export function canAccess(role: AppRole, section: AppSection) {
  if (role === "admin") return true;
  const allowedSections = permissionMatrix[role];
  if (!Array.isArray(allowedSections)) return false;
  return allowedSections.includes(section);
}
