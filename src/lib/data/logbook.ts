import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { it } from "date-fns/locale";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { formatProcedureCatalogPath } from "@/lib/domain/logbook-procedure-catalog";
import type { LogbookParticipationRole } from "@/lib/domain/logbook-participation";
import { participationRoleLabel } from "@/lib/domain/logbook-participation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export { participationRoleLabel };

/** Ordine come su DB legacy → schema corrente. */
export const LOGBOOK_TRAINEE_COLUMNS = ["user_id", "trainee_profile_id", "trainee_id"] as const;

export type LogbookTraineeFilterColumn = (typeof LOGBOOK_TRAINEE_COLUMNS)[number];

/** Nome colonna FK verso procedure_catalog (schema repo vs remoto). */
export const LOGBOOK_PROCEDURE_COLUMNS = ["procedure_catalog_id", "procedure_id"] as const;

export type LogbookProcedureColumn = (typeof LOGBOOK_PROCEDURE_COLUMNS)[number];

export async function probeLogbookTraineeFilterColumn(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<LogbookTraineeFilterColumn> {
  for (const column of LOGBOOK_TRAINEE_COLUMNS) {
    const { error } = await supabase.from("logbook_entries").select(column as "id").limit(1);
    if (!error) return column;
  }
  throw new Error(
    `logbook_entries: nessuna colonna tirocinante tra ${LOGBOOK_TRAINEE_COLUMNS.join(", ")}. Allinea il database.`,
  );
}

export async function probeLogbookProcedureColumn(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<LogbookProcedureColumn> {
  for (const column of LOGBOOK_PROCEDURE_COLUMNS) {
    const { error } = await supabase.from("logbook_entries").select(column as "id").limit(1);
    if (!error) return column;
  }
  throw new Error(
    `logbook_entries: nessuna colonna procedura tra ${LOGBOOK_PROCEDURE_COLUMNS.join(", ")}. Allinea il database.`,
  );
}

/** UUID tirocinante indipendentemente dal nome colonna nel DB. */
export function traineeIdFromLogbookRow(row: Record<string, unknown>): string {
  for (const column of LOGBOOK_TRAINEE_COLUMNS) {
    const v = row[column];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** UUID catalogo procedura indipendentemente dal nome colonna nel DB. */
export function procedureIdFromLogbookRow(row: Record<string, unknown>): string {
  for (const column of LOGBOOK_PROCEDURE_COLUMNS) {
    const v = row[column];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export type SupervisionLevel = "diretta" | "indiretta" | "assente";
export type AutonomyLevel = "assistito" | "con_supervisione" | "autonomo";

export type ProcedureCatalogRow = {
  id: string;
  name: string;
  category: string;
  procedure_name: string;
  subtype: string | null;
  description: string | null;
  active: boolean;
};

export function procedureCatalogLabel(row: Pick<ProcedureCatalogRow, "category" | "procedure_name" | "subtype" | "name">) {
  if (row.procedure_name?.trim()) {
    return formatProcedureCatalogPath({
      category: row.category,
      procedure: row.procedure_name,
      subtype: row.subtype,
    });
  }
  return row.name?.trim() || "Procedura";
}

export type LogbookEntryListRow = {
  id: string;
  trainee_profile_id: string;
  procedure_catalog_id: string;
  performed_on: string;
  quantity: number;
  participation_role: LogbookParticipationRole;
  supervision_level: SupervisionLevel;
  autonomy_level: AutonomyLevel;
  confidence_level: number;
  notes: string | null;
  created_at: string;
  procedure_catalog: {
    name: string;
    category: string;
    procedure_name: string;
    subtype: string | null;
  } | null;
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
    .select("id, name, category, procedure_name, subtype, description, active")
    .eq("active", true)
    .order("category", { ascending: true })
    .order("procedure_name", { ascending: true })
    .order("subtype", { ascending: true });

  if (error) {
    throw new Error(`procedure_catalog list failed: ${error.message}`);
  }

  return (data ?? []) as ProcedureCatalogRow[];
}

export async function listRecentLogbookEntries(profile: CurrentUserProfile, limit = 30): Promise<LogbookEntryListRow[]> {
  const supabase = await createServerSupabaseClient();
  const traineeCol =
    profile.role === "specializzando" ? await probeLogbookTraineeFilterColumn(supabase) : null;

  let query = supabase
    .from("logbook_entries")
    .select(
      `
      *,
      procedure_catalog ( name, category, procedure_name, subtype )
    `,
    )
    .order("performed_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (profile.role === "specializzando" && traineeCol) {
    query = query.eq(traineeCol, profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`logbook_entries list failed: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown> & {
      procedure_catalog:
        | {
            name: string;
            category: string;
            procedure_name: string;
            subtype: string | null;
          }
        | {
            name: string;
            category: string;
            procedure_name: string;
            subtype: string | null;
          }[]
        | null;
    };
    const procedure_catalog = firstOrNull(row.procedure_catalog);

    return {
      id: String(row.id ?? ""),
      trainee_profile_id: traineeIdFromLogbookRow(row),
      procedure_catalog_id: procedureIdFromLogbookRow(row),
      performed_on: String(row.performed_on ?? "").trim(),
      quantity: Math.max(1, Number(row.quantity ?? 1)),
      participation_role: String(row.participation_role ?? "assistito") as LogbookParticipationRole,
      supervision_level: row.supervision_level as LogbookEntryListRow["supervision_level"],
      autonomy_level: row.autonomy_level as LogbookEntryListRow["autonomy_level"],
      confidence_level: Number(row.confidence_level ?? 0),
      notes: typeof row.notes === "string" ? row.notes : null,
      created_at: String(row.created_at ?? ""),
      procedure_catalog,
    };
  });
}

type ReportRow = { label: string; value: number };

function aggregateTopProcedures(
  rows: {
    quantity?: number;
    procedure_catalog:
      | {
          name: string;
          category: string;
          procedure_name: string;
          subtype: string | null;
        }
      | {
          name: string;
          category: string;
          procedure_name: string;
          subtype: string | null;
        }[]
      | null;
  }[],
  take: number,
): ReportRow[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const proc = firstOrNull(row.procedure_catalog);
    const qty = Math.max(1, Number(row.quantity ?? 1));
    const label = proc
      ? proc.procedure_name?.trim()
        ? formatProcedureCatalogPath({
            category: proc.category,
            procedure: proc.procedure_name,
            subtype: proc.subtype,
          })
        : proc.name?.trim() || "Procedura"
      : "Procedura";
    counts.set(label, (counts.get(label) ?? 0) + qty);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, take).map(([label, value]) => ({ label, value }));

  while (top.length < take) {
    top.push({ label: "—", value: 0 });
  }

  return top;
}

async function fetchEntriesInRange(
  profile: CurrentUserProfile,
  from: string,
  to: string,
  traineeColumn: LogbookTraineeFilterColumn | null,
) {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from("logbook_entries")
    .select(
      `
      performed_on,
      quantity,
      procedure_catalog ( name, category, procedure_name, subtype )
    `,
    )
    .gte("performed_on", from)
    .lte("performed_on", to);

  if (profile.role === "specializzando" && traineeColumn) {
    query = query.eq(traineeColumn, profile.id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`logbook_entries report range failed: ${error.message}`);
  }

  return (data ?? []) as {
    performed_on: string;
    quantity: number;
    procedure_catalog:
      | { name: string; category: string; procedure_name: string; subtype: string | null }
      | { name: string; category: string; procedure_name: string; subtype: string | null }[]
      | null;
  }[];
}

/**
 * Top procedure counts per period; visibility follows RLS (specializzando: own; admin: all).
 * `rollingTwoMonths` = da inizio del mese scorso a fine del mese corrente (finestra rolling, non bimestre calendario).
 */
export async function getLogbookProcedureReportSections(profile: CurrentUserProfile) {
  const supabase = await createServerSupabaseClient();
  const traineeColumn =
    profile.role === "specializzando" ? await probeLogbookTraineeFilterColumn(supabase) : null;

  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const rollingTwoMonthsStart = format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd");
  const rollingTwoMonthsEnd = monthEnd;

  const [weekRows, monthRows, rollingTwoMonthsRows] = await Promise.all([
    fetchEntriesInRange(profile, weekStart, weekEnd, traineeColumn),
    fetchEntriesInRange(profile, monthStart, monthEnd, traineeColumn),
    fetchEntriesInRange(profile, rollingTwoMonthsStart, rollingTwoMonthsEnd, traineeColumn),
  ]);

  return {
    week: aggregateTopProcedures(weekRows, 3),
    month: aggregateTopProcedures(monthRows, 3),
    rollingTwoMonths: aggregateTopProcedures(rollingTwoMonthsRows, 3),
  };
}
