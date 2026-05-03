"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateClinicalAreaAction } from "@/app/(app)/admin/clinical-areas-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClinicalAreaRow } from "@/lib/data/clinical-areas";

export function ClinicalAreaEditRow({ area }: { area: ClinicalAreaRow }) {
  const router = useRouter();
  const [name, setName] = useState(area.name);
  const [description, setDescription] = useState(area.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(area.sort_order));
  const [isActive, setIsActive] = useState(area.is_active);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const save = () => {
    setError(null);
    const fd = new FormData();
    fd.set("id", area.id);
    fd.set("name", name);
    fd.set("description", description);
    fd.set("sort_order", sortOrder);
    fd.set("is_active", isActive ? "true" : "false");
    startTransition(async () => {
      const res = await updateClinicalAreaAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <li className="space-y-2 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-xs text-muted-foreground">{area.code}</span>
        {!area.is_active ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">Disattiva</span>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`name-${area.id}`}>
            Nome
          </label>
          <Input id={`name-${area.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`sort-${area.id}`}>
            Ordine
          </label>
          <Input
            id={`sort-${area.id}`}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`desc-${area.id}`}>
          Descrizione
        </label>
        <textarea
          id={`desc-${area.id}`}
          className="min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Attiva (nuovi turni / import)
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="button" size="sm" variant="secondary" onClick={save} disabled={isPending}>
        {isPending ? "Salvataggio…" : "Salva modifiche"}
      </Button>
    </li>
  );
}
