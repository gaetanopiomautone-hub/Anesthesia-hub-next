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
  addetto_turni: ["dashboard", "turni", "turni-ferie", "ferie", "universita", "archivio", "report"],
  amministratore: ["dashboard", "turni", "turni-ferie", "ferie", "universita", "archivio", "logbook", "report", "admin"],
  tutor_strutturato: ["dashboard", "turni", "universita", "archivio", "logbook", "report"],
};

export function canAccess(role: AppRole, section: AppSection) {
  return permissionMatrix[role].includes(section);
}
