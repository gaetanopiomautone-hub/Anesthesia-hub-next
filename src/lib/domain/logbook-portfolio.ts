import { formatProcedureCatalogPath } from "@/lib/domain/logbook-procedure-catalog";
import type { LogbookParticipationRole } from "@/lib/domain/logbook-participation";
import { participationRoleLabel } from "@/lib/domain/logbook-participation";

export type LogbookPortfolioEntry = {
  quantity: number;
  participation_role: LogbookParticipationRole;
  procedure_catalog: {
    category: string;
    procedure_name: string;
    subtype: string | null;
    name: string;
  } | null;
};

export type PortfolioBreakdownRow = { label: string; value: number };

export type LogbookPortfolioReport = {
  totalQuantity: number;
  entryCount: number;
  byCategory: PortfolioBreakdownRow[];
  byProcedure: PortfolioBreakdownRow[];
  byParticipationRole: PortfolioBreakdownRow[];
};

function procedureLabel(entry: LogbookPortfolioEntry): string {
  const proc = entry.procedure_catalog;
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

function addToMap(map: Map<string, number>, key: string, qty: number) {
  map.set(key, (map.get(key) ?? 0) + qty);
}

function sortedRows(map: Map<string, number>): PortfolioBreakdownRow[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
    .map(([label, value]) => ({ label, value }));
}

export function buildLogbookPortfolioReport(
  entries: LogbookPortfolioEntry[],
  options?: { categoryFilter?: string | null },
): LogbookPortfolioReport {
  const categoryFilter = options?.categoryFilter?.trim() || null;

  const filtered = categoryFilter
    ? entries.filter((e) => e.procedure_catalog?.category === categoryFilter)
    : entries;

  const byCategory = new Map<string, number>();
  const byProcedure = new Map<string, number>();
  const byRole = new Map<string, number>();
  let totalQuantity = 0;

  for (const entry of filtered) {
    const qty = Math.max(1, Number(entry.quantity ?? 1));
    totalQuantity += qty;

    const cat = entry.procedure_catalog?.category?.trim() || "Senza categoria";
    addToMap(byCategory, cat, qty);
    addToMap(byProcedure, procedureLabel(entry), qty);
    addToMap(byRole, participationRoleLabel(entry.participation_role), qty);
  }

  return {
    totalQuantity,
    entryCount: filtered.length,
    byCategory: sortedRows(byCategory),
    byProcedure: sortedRows(byProcedure),
    byParticipationRole: sortedRows(byRole),
  };
}
