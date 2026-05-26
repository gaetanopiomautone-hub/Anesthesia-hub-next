import { endOfYear, format, startOfYear } from "date-fns";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import {
  buildLogbookPortfolioReport,
  type LogbookPortfolioEntry,
  type LogbookPortfolioReport,
} from "@/lib/domain/logbook-portfolio";
import type { LogbookParticipationRole } from "@/lib/domain/logbook-participation";
import { listActiveProcedureCatalog } from "@/lib/data/logbook";
import { probeLogbookTraineeFilterColumn } from "@/lib/data/logbook";
import { listAssignableUsers } from "@/lib/data/shifts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PortfolioTraineeOption = { id: string; label: string };

export type LogbookPortfolioQuery = {
  from: string;
  to: string;
  traineeId?: string | null;
  category?: string | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function defaultFromDate(): string {
  return format(startOfYear(new Date()), "yyyy-MM-dd");
}

function defaultToDate(): string {
  return format(endOfYear(new Date()), "yyyy-MM-dd");
}

export function normalizePortfolioQuery(
  raw: Record<string, string | undefined>,
  profile: CurrentUserProfile,
): LogbookPortfolioQuery {
  const from = raw.from?.trim() || defaultFromDate();
  const to = raw.to?.trim() || defaultToDate();
  const category = raw.category?.trim() || null;

  let traineeId: string | null = null;
  if (profile.role === "specializzando") {
    traineeId = profile.id;
  } else if (raw.trainee?.trim()) {
    traineeId = raw.trainee.trim();
  }

  return { from, to, traineeId, category };
}

export async function listPortfolioTraineeOptions(
  profile: CurrentUserProfile,
): Promise<PortfolioTraineeOption[]> {
  if (profile.role === "specializzando") {
    return [];
  }

  const users = await listAssignableUsers();
  return users.map((u) => ({
    id: u.id,
    label: u.list_label?.trim() || u.full_name?.trim() || u.email?.trim() || u.id,
  }));
}

async function fetchPortfolioEntries(
  profile: CurrentUserProfile,
  query: LogbookPortfolioQuery,
): Promise<LogbookPortfolioEntry[]> {
  const supabase = await createServerSupabaseClient();
  const traineeCol = await probeLogbookTraineeFilterColumn(supabase);

  let dbQuery = supabase
    .from("logbook_entries")
    .select(
      `
      quantity,
      participation_role,
      procedure_catalog ( name, category, procedure_name, subtype )
    `,
    )
    .gte("performed_on", query.from)
    .lte("performed_on", query.to);

  if (profile.role === "specializzando" && traineeCol) {
    dbQuery = dbQuery.eq(traineeCol, profile.id);
  } else if (query.traineeId && traineeCol) {
    dbQuery = dbQuery.eq(traineeCol, query.traineeId);
  }

  const { data, error } = await dbQuery;

  if (error) {
    throw new Error(`logbook portfolio fetch failed: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const row = raw as Record<string, unknown> & {
      procedure_catalog:
        | LogbookPortfolioEntry["procedure_catalog"]
        | LogbookPortfolioEntry["procedure_catalog"][]
        | null;
    };
    const proc = firstOrNull(row.procedure_catalog);
    return {
      quantity: Math.max(1, Number(row.quantity ?? 1)),
      participation_role: String(row.participation_role ?? "assistito") as LogbookParticipationRole,
      procedure_catalog: proc,
    };
  });
}

export async function getLogbookPortfolioReport(
  profile: CurrentUserProfile,
  query: LogbookPortfolioQuery,
): Promise<{
  report: LogbookPortfolioReport;
  categories: string[];
  traineeOptions: PortfolioTraineeOption[];
  resolvedQuery: LogbookPortfolioQuery;
  subjectLabel: string;
}> {
  const [entries, categories, traineeOptions] = await Promise.all([
    fetchPortfolioEntries(profile, query),
    listActiveProcedureCatalog().then((rows) => [...new Set(rows.map((r) => r.category))].sort((a, b) => a.localeCompare(b, "it"))),
    listPortfolioTraineeOptions(profile),
  ]);

  const report = buildLogbookPortfolioReport(entries, { categoryFilter: query.category });

  let subjectLabel = "Tutti gli specializzandi visibili";
  if (profile.role === "specializzando") {
    subjectLabel = "Il tuo portfolio";
  } else if (query.traineeId) {
    const match = traineeOptions.find((t) => t.id === query.traineeId);
    subjectLabel = match?.label ?? "Specializzando selezionato";
  }

  return {
    report,
    categories,
    traineeOptions,
    resolvedQuery: query,
    subjectLabel,
  };
}
