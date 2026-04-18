import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { it } from "date-fns/locale";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SupervisionLevel = "diretta" | "indiretta" | "assente";
export type AutonomyLevel = "assistito" | "con_supervisione" | "autonomo";

export type ProcedureCatalogRow = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  active: boolean;
};

export type LogbookEntryListRow = {
  id: string;
  trainee_profile_id: string;
  procedure_catalog_id: string;
  performed_on: string;
  supervision_level: SupervisionLevel;
  autonomy_level: AutonomyLevel;
  confidence_level: number;
  notes: string | null;
  created_at: string;
  procedure_catalog: { name: string } | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export function formatLogbookDate(value: string) {
  return format(new Date(value), "dd/MM/yyyy", { locale: it });
}

export function supervisionLevelLabel(level: SupervisionLevel) {
  switch (level) {
    case "diretta":
      return "Diretta";
    case "indiretta":
      return "Indiretta";
    case "assente":
      return "Assente";
    default:
      return level;
  }
}

export function autonomyLevelLabel(level: AutonomyLevel) {
  switch (level) {
    case "assistito":
      return "Assistito";
    case "con_supervisione":
      return "Con supervisione";
    case "autonomo":
      return "Autonomo";
    default:
      return level;
  }
}

export async function listActiveProcedureCatalog(): Promise<ProcedureCatalogRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("procedure_catalog")
    .select("id, name, category, description, active")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`procedure_catalog list failed: ${error.message}`);
  }

  return (data ?? []) as ProcedureCatalogRow[];
}

export async function listRecentLogbookEntries(profile: CurrentUserProfile, limit = 30): Promise<LogbookEntryListRow[]> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("logbook_entries")
    .select(
      `
      id,
      trainee_profile_id,
      procedure_catalog_id,
      performed_on,
      supervision_level,
      autonomy_level,
      confidence_level,
      notes,
      created_at,
      procedure_catalog ( name )
    `,
    )
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (profile.role === "specializzando") {
    query = query.eq("trainee_profile_id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`logbook_entries list failed: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const row = raw as Omit<LogbookEntryListRow, "procedure_catalog"> & {
      procedure_catalog: { name: string } | { name: string }[] | null;
    };

    return {
      ...row,
      procedure_catalog: firstOrNull(row.procedure_catalog),
    };
  });
}

type ReportRow = { label: string; value: number };

function aggregateTopProcedures(
  rows: { procedure_catalog: { name: string } | { name: string }[] | null }[],
  take: number,
): ReportRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const proc = firstOrNull(row.procedure_catalog);
    const name = proc?.name?.trim() || "Procedura";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, take).map(([label, value]) => ({ label, value }));

  while (top.length < take) {
    top.push({ label: "—", value: 0 });
  }

  return top;
}

async function fetchEntriesInRange(profile: CurrentUserProfile, from: string, to: string) {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("logbook_entries")
    .select(
      `
      performed_on,
      procedure_catalog ( name )
    `,
    )
    .gte("performed_on", from)
    .lte("performed_on", to);

  if (profile.role === "specializzando") {
    query = query.eq("trainee_profile_id", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`logbook_entries report range failed: ${error.message}`);
  }

  return (data ?? []) as {
    performed_on: string;
    procedure_catalog: { name: string } | { name: string }[] | null;
  }[];
}

/**
 * Top procedure counts per period; visibility follows RLS (specializzando: own; admin: all).
 * `rollingTwoMonths` = da inizio del mese scorso a fine del mese corrente (finestra rolling, non bimestre calendario).
 */
export async function getLogbookProcedureReportSections(profile: CurrentUserProfile) {
  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const rollingTwoMonthsStart = format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
  const rollingTwoMonthsEnd = monthEnd;

  const [weekRows, monthRows, rollingTwoMonthsRows] = await Promise.all([
    fetchEntriesInRange(profile, weekStart, weekEnd),
    fetchEntriesInRange(profile, monthStart, monthEnd),
    fetchEntriesInRange(profile, rollingTwoMonthsStart, rollingTwoMonthsEnd),
  ]);

  return {
    week: aggregateTopProcedures(weekRows, 3),
    month: aggregateTopProcedures(monthRows, 3),
    rollingTwoMonths: aggregateTopProcedures(rollingTwoMonthsRows, 3),
  };
}
