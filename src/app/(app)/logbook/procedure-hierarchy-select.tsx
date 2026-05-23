"use client";

import { useMemo, useState } from "react";

import {
  formatProcedureCatalogDisplayName,
  groupProcedureCatalogRows,
  type ProcedureCatalogGrouped,
} from "@/lib/domain/logbook-procedure-catalog";
import type { ProcedureCatalogRow } from "@/lib/data/logbook";

type Props = {
  name: string;
  procedures: ProcedureCatalogRow[];
  defaultProcedureId?: string;
};

function findDefaults(grouped: ProcedureCatalogGrouped[], procedureId?: string) {
  if (!procedureId) {
    return { category: "", procedure: "", catalogId: "" };
  }
  for (const cat of grouped) {
    for (const proc of cat.procedures) {
      const hit = proc.items.find((i) => i.id === procedureId);
      if (hit) {
        return { category: cat.category, procedure: proc.procedure, catalogId: hit.id };
      }
    }
  }
  return { category: "", procedure: "", catalogId: procedureId };
}

export function ProcedureHierarchySelect({ name, procedures, defaultProcedureId }: Props) {
  const grouped = useMemo(
    () =>
      groupProcedureCatalogRows(
        procedures.map((p) => ({
          id: p.id,
          category: p.category,
          procedure_name: p.procedure_name,
          subtype: p.subtype?.trim() ? p.subtype : null,
        })),
      ),
    [procedures],
  );

  const initial = findDefaults(grouped, defaultProcedureId);
  const [category, setCategory] = useState(initial.category);
  const [procedure, setProcedure] = useState(initial.procedure);
  const [catalogId, setCatalogId] = useState(initial.catalogId);

  const proceduresInCategory = grouped.find((g) => g.category === category)?.procedures ?? [];
  const itemsInProcedure = proceduresInCategory.find((p) => p.procedure === procedure)?.items ?? [];

  const onCategoryChange = (next: string) => {
    setCategory(next);
    const firstProc = grouped.find((g) => g.category === next)?.procedures[0];
    const firstItem = firstProc?.items[0];
    setProcedure(firstProc?.procedure ?? "");
    setCatalogId(firstItem?.id ?? "");
  };

  const onProcedureChange = (next: string) => {
    setProcedure(next);
    const firstItem = proceduresInCategory.find((p) => p.procedure === next)?.items[0];
    setCatalogId(firstItem?.id ?? "");
  };

  const onSubtypeChange = (id: string) => {
    setCatalogId(id);
  };

  return (
    <div className="grid gap-2">
      <input type="hidden" name={name} value={catalogId} required />
      <label className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Categoria</span>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          required
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="" disabled>
            Seleziona categoria
          </option>
          {grouped.map((g) => (
            <option key={g.category} value={g.category}>
              {g.category}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-xs font-medium text-muted-foreground">Procedura</span>
        <select
          value={procedure}
          onChange={(e) => onProcedureChange(e.target.value)}
          required
          disabled={!category}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
        >
          <option value="" disabled>
            Seleziona procedura
          </option>
          {proceduresInCategory.map((p) => (
            <option key={p.procedure} value={p.procedure}>
              {p.procedure}
            </option>
          ))}
        </select>
      </label>
      {itemsInProcedure.length > 1 || (itemsInProcedure[0]?.subtype ?? "").trim() ? (
        <label className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground">Sottotipo (se applicabile)</span>
          <select
            value={catalogId}
            onChange={(e) => onSubtypeChange(e.target.value)}
            required
            disabled={!procedure}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
          >
            {itemsInProcedure.map((item) => (
              <option key={item.id} value={item.id}>
                {item.subtype?.trim()
                  ? item.subtype
                  : formatProcedureCatalogDisplayName({ procedure, subtype: null })}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}
