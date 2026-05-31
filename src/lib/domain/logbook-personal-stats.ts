import { formatProcedureCatalogPath } from "@/lib/domain/logbook-procedure-catalog";

export type LogbookProcedureCatalogEmbed = {
  name: string;
  category: string;
  procedure_name: string;
  subtype: string | null;
};

export type LogbookPersonalStatsRow = {
  quantity?: number | null;
  performed_on?: string | null;
  procedure_date?: string | null;
  created_at?: string | null;
  procedure_catalog: LogbookProcedureCatalogEmbed | LogbookProcedureCatalogEmbed[] | null;
};

export type LogbookProcedureTotal = {
  label: string;
  total: number;
};

export type LogbookPersonalStats = {
  totalProcedures: number;
  categoriesUsed: number;
  lastRegistration: string | null;
  procedureTotals: LogbookProcedureTotal[];
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function entryDate(row: LogbookPersonalStatsRow): string {
  for (const value of [row.performed_on, row.procedure_date, row.created_at]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export function logbookProcedureDisplayLabel(
  proc: LogbookProcedureCatalogEmbed | null | undefined,
): string {
  if (!proc) return "Procedura";
  if (proc.procedure_name?.trim()) {
    return formatProcedureCatalogPath({
      category: proc.category,
      procedure: proc.procedure_name,
      subtype: proc.subtype,
    });
  }
  return proc.name?.trim() || "Procedura";
}

export function buildLogbookPersonalStats(rows: LogbookPersonalStatsRow[]): LogbookPersonalStats {
  let totalProcedures = 0;
  const categories = new Set<string>();
  let lastRegistration: string | null = null;
  const procedureTotals = new Map<string, number>();

  for (const row of rows) {
    const qty = Math.max(1, Number(row.quantity ?? 1));
    totalProcedures += qty;

    const proc = firstOrNull(row.procedure_catalog);
    const category = proc?.category?.trim();
    if (category) categories.add(category);

    const date = entryDate(row);
    if (date && (!lastRegistration || date > lastRegistration)) {
      lastRegistration = date;
    }

    const label = logbookProcedureDisplayLabel(proc);
    procedureTotals.set(label, (procedureTotals.get(label) ?? 0) + qty);
  }

  return {
    totalProcedures,
    categoriesUsed: categories.size,
    lastRegistration,
    procedureTotals: [...procedureTotals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
      .map(([label, total]) => ({ label, total })),
  };
}
