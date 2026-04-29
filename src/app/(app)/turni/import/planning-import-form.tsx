"use client";

import { format } from "date-fns";
import { it } from "date-fns/locale";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  previewPlanningAction,
  importPlanningAction,
  checkMonthlyPlanExistsAction,
} from "@/app/(app)/turni/import-actions";
import type { PlanningFilePreview, ShiftItemDraft } from "@/lib/import/planning-parser";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppRole } from "@/lib/auth/roles";

const defaultYear = new Date().getFullYear();
const defaultMonth = new Date().getMonth() + 1;

function isNextRedirectError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "digest" in e &&
    String((e as { digest?: string }).digest).includes("NEXT_REDIRECT")
  );
}

function toIntForImport(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

type EditableSalaItem = ShiftItemDraft & { id: string };

function toSalaLabel(period: "mattina" | "pomeriggio") {
  return period === "mattina" ? "Sala · Mattina" : "Sala · Pomeriggio";
}

export function PlanningImportForm({ role }: { role: AppRole }) {
  const isAdmin = role === "admin";
  const formRef = useRef<HTMLFormElement>(null);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [preview, setPreview] = useState<Extract<PlanningFilePreview, { ok: true }> | null>(null);
  const [editableSalaItems, setEditableSalaItems] = useState<EditableSalaItem[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDuplicateYearMonth, setImportDuplicateYearMonth] = useState<string | null>(null);
  const [existingDbPlan, setExistingDbPlan] = useState<{ yearMonth: string; label: string } | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isAdmin) {
      setExistingDbPlan(null);
      return;
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setExistingDbPlan(null);
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      setExistingDbPlan(null);
      return;
    }
    const t = window.setTimeout(() => {
      void checkMonthlyPlanExistsAction(year, month).then((r) => {
        if (r.exists && r.yearMonth) {
          setExistingDbPlan({
            yearMonth: r.yearMonth,
            label: format(new Date(r.yearMonth + "-01"), "LLLL yyyy", { locale: it }).replace(
              /^\w/u,
              (c) => c.toLocaleUpperCase("it"),
            ),
          });
        } else {
          setExistingDbPlan(null);
        }
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [isAdmin, year, month]);

  useEffect(() => {
    setOverwrite(false);
  }, [year, month]);

  const runPreview = () => {
    setPreviewError(null);
    setImportError(null);
    setImportDuplicateYearMonth(null);
    setPreview(null);
    setEditableSalaItems([]);
    const form = formRef.current;
    if (!form) return;
    const fileInput = form.querySelector<HTMLInputElement>('input[name="file"]');
    if (!fileInput?.files?.length) {
      setPreviewError("Seleziona un file .xlsx");
      return;
    }
    const fd = new FormData(form);
    startTransition(async () => {
      const result = await previewPlanningAction(fd);
      if (result.ok) {
        setPreview(result.preview);
        setEditableSalaItems(
          result.salaItems.map((item, i) => ({
            ...item,
            id: `${item.shift_date}-${item.period}-${item.room_name ?? "sala"}-${i}`,
          })),
        );
        return;
      }
      setPreviewError(result.error);
    });
  };

  const runImport = () => {
    setImportError(null);
    setImportDuplicateYearMonth(null);
    const form = formRef.current;
    if (!form) return;
    if (!form.querySelector<HTMLInputElement>('input[name="file"]')?.files?.length) {
      setImportError("Seleziona di nuovo il file per importare (la sessione di anteprima richiede il file ancora presente).");
      return;
    }
    const fd = new FormData(form);
    if (isAdmin) {
      fd.set(
        "editedSalaItems",
        JSON.stringify(
          editableSalaItems.map(({ id: _id, ...item }) => ({
            ...item,
            period: item.period === "pomeriggio" ? "pomeriggio" : "mattina",
            label: toSalaLabel(item.period === "pomeriggio" ? "pomeriggio" : "mattina"),
            source: "excel" as const,
          })),
        ),
      );
    }
    startTransition(async () => {
      try {
        const result = await importPlanningAction(fd);
        if (result && "ok" in result && !result.ok) {
          if ("code" in result && result.code === "ALREADY_EXISTS") {
            const y = toIntForImport(fd.get("year"));
            const m = toIntForImport(fd.get("month"));
            if (y != null && m != null) {
              setImportDuplicateYearMonth(`${y}-${String(m).padStart(2, "0")}`);
            }
            setImportError(
              "Esiste già un planning per questo mese. Spunta «Sovrascrivi se il piano…» per sostituirlo dal file, oppure scegli un altro mese.",
            );
          } else {
            setImportError("error" in result ? result.error : "Import non riuscito");
          }
        }
      } catch (e) {
        if (isNextRedirectError(e)) return;
        setImportError(e instanceof Error ? e.message : "Errore imprevisto in import");
      }
    });
  };

  const updateSalaItem = (id: string, patch: Partial<EditableSalaItem>) => {
    setEditableSalaItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeSalaItem = (id: string) => {
    setEditableSalaItems((prev) => prev.filter((it) => it.id !== id));
  };

  const addSalaItem = () => {
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    setEditableSalaItems((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        shift_date: date,
        kind: "sala",
        period: "mattina",
        start_time: "08:00:00",
        end_time: "14:00:00",
        label: "Sala · Mattina",
        room_name: "Sala",
        specialty: "",
        source: "excel",
      },
    ]);
  };

  const effectiveSaleCount = preview ? (isAdmin ? editableSalaItems.length : preview.saleCount) : 0;
  const effectiveTotalItems = preview ? preview.totalItems - preview.saleCount + effectiveSaleCount : 0;

  return (
    <div className="space-y-8">
      <form ref={formRef} className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="import-year">Anno</Label>
            <Input
              id="import-year"
              name="year"
              type="number"
              min={2000}
              max={2100}
              required
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="import-month">Mese (1–12)</Label>
            <Input
              id="import-month"
              name="month"
              type="number"
              min={1}
              max={12}
              required
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="import-file">File planning (.xlsx)</Label>
          <Input id="import-file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={runPreview} disabled={isPending} variant="secondary">
            {isPending && !preview ? "Elaborazione…" : "Genera anteprima"}
          </Button>
        </div>

      {existingDbPlan ? (
        <div
          className="rounded-lg border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p>
            <span className="font-medium">Esiste già un planning in database per {existingDbPlan.label}.</span> Per
            sostituirlo con questo file, in anteprima spunta l’opzione di sovrascrittura prima di «Importa in
            produzione». In alternativa cambia mese o apri il mese per modificarlo a mano.
          </p>
          <p className="mt-2">
            <Link
              href={`/turni?month=${encodeURIComponent(existingDbPlan.yearMonth)}`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              Vai al mese
            </Link>
          </p>
        </div>
      ) : null}

      {previewError ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {previewError}
        </div>
      ) : null}

      {preview ? (
        <Card title="Anteprima" description="Verifica i numeri prima di scrivere sul database.">
          <div className="space-y-4 text-sm text-foreground">
            <p className="text-base font-semibold capitalize text-foreground">{preview.monthLabel}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              <li>
                <span className="text-muted-foreground">Slot sale operatorie: </span>
                <span className="font-medium tabular-nums">{effectiveSaleCount}</span>
              </li>
              <li>
                <span className="text-muted-foreground">Righe file escluse: </span>
                <span className="font-medium tabular-nums">{preview.excludedCount}</span>
              </li>
              <li>
                <span className="text-muted-foreground">Ambulatori (lun–ven): </span>
                <span className="font-medium tabular-nums">{preview.ambulatorioCount}</span>
              </li>
              <li>
                <span className="text-muted-foreground">Reperibilità (we + extra): </span>
                <span className="font-medium tabular-nums">{preview.onCallCount}</span>
              </li>
              <li className="sm:col-span-2">
                <span className="text-muted-foreground">Totale voci in import: </span>
                <span className="font-medium tabular-nums">{effectiveTotalItems}</span>
              </li>
            </ul>
            {!isAdmin ? (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Visualizzazione in sola lettura: solo gli admin possono modificare e importare gli slot sala.
              </div>
            ) : null}
            {preview.weekdayDatesWithoutSala.length > 0 ? (
              <div
                className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-amber-950"
                role="status"
              >
                <p className="text-xs font-medium">Giorni feriali senza turni in sala nel file (controlla il planning)</p>
                <p className="mt-1 text-sm">
                  {preview.weekdayDatesWithoutSala
                    .slice(0, 20)
                    .map((d) => formatDateItalian(d))
                    .join(", ")}
                  {preview.weekdayDatesWithoutSala.length > 20 ? "…" : ""}
                </p>
              </div>
            ) : null}
            {preview.duplicateSalaKeys.length > 0 ? (
              <div
                className="rounded-lg border border-rose-200/80 bg-rose-50/90 px-3 py-2 text-rose-900"
                role="status"
              >
                <p className="text-xs font-medium">Slot sala duplicati (stessa data, fascia, sala) — riga Excel ripetuta?</p>
                <ul className="mt-1 list-inside list-disc text-sm">
                  {preview.duplicateSalaKeys.slice(0, 8).map((k) => (
                    <li key={k} className="font-mono text-xs">
                      {k}
                    </li>
                  ))}
                </ul>
                {preview.duplicateSalaKeys.length > 8 ? (
                  <p className="text-xs">…e altre {preview.duplicateSalaKeys.length - 8} chiavi</p>
                ) : null}
              </div>
            ) : null}
            {preview.datesCompletelyEmptyInMonth.length > 0 ? (
              <div
                className="rounded-lg border-2 border-amber-500/50 bg-amber-50/95 px-3 py-2.5 text-amber-950"
                role="alert"
              >
                <p className="text-sm font-semibold">⚠ Giorno senza copertura</p>
                <p className="mt-1 text-sm">
                  Questi giorni del mese non hanno nessun turno importato: né in sala, né in ambulatorio, né
                  reperibilità.
                </p>
                <p className="mt-1.5 text-sm">
                  {preview.datesCompletelyEmptyInMonth
                    .slice(0, 18)
                    .map((d) => formatDateItalian(d))
                    .join(", ")}
                  {preview.datesCompletelyEmptyInMonth.length > 18
                    ? `… (${preview.datesCompletelyEmptyInMonth.length} giorni)`
                    : ""}
                </p>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium text-muted-foreground">Prime 10 righe (esempio)</p>
              <ol className="mt-2 list-decimal pl-5 text-foreground">
                {preview.sampleRows.length === 0 ? (
                  <li className="text-muted-foreground">Nessuna riga (file vuoto per questo mese?)</li>
                ) : (
                  preview.sampleRows.map((row, i) => <li key={`${i}-${row}`}>{row}</li>)
                )}
              </ol>
            </div>
            <div className="rounded-lg border border-border bg-background/80 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">Slot sala importati</p>
                {isAdmin ? (
                  <Button type="button" variant="secondary" size="sm" onClick={addSalaItem}>
                    Aggiungi sala
                  </Button>
                ) : null}
              </div>
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-2 py-1 text-left">Data</th>
                      <th className="px-2 py-1 text-left">Fascia</th>
                      <th className="px-2 py-1 text-left">Sala</th>
                      <th className="px-2 py-1 text-left">Specialità</th>
                      {isAdmin ? <th className="px-2 py-1 text-right">Azioni</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {editableSalaItems.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-muted-foreground" colSpan={isAdmin ? 5 : 4}>
                          Nessuno slot sala rilevato.
                        </td>
                      </tr>
                    ) : (
                      editableSalaItems.map((item) => (
                        <tr key={item.id} className="border-b border-border/60">
                          <td className="px-2 py-1">
                            {isAdmin ? (
                              <Input
                                type="date"
                                value={item.shift_date}
                                onChange={(e) => updateSalaItem(item.id, { shift_date: e.target.value })}
                              />
                            ) : (
                              formatDateItalian(item.shift_date)
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {isAdmin ? (
                              <select
                                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                value={item.period}
                                onChange={(e) => {
                                  const period = e.target.value === "pomeriggio" ? "pomeriggio" : "mattina";
                                  updateSalaItem(item.id, {
                                    period,
                                    start_time: period === "mattina" ? "08:00:00" : "14:00:00",
                                    end_time: period === "mattina" ? "14:00:00" : "20:00:00",
                                    label: toSalaLabel(period),
                                  });
                                }}
                              >
                                <option value="mattina">Mattina</option>
                                <option value="pomeriggio">Pomeriggio</option>
                              </select>
                            ) : (
                              item.period === "mattina" ? "Mattina" : "Pomeriggio"
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {isAdmin ? (
                              <Input
                                value={item.room_name ?? ""}
                                onChange={(e) => updateSalaItem(item.id, { room_name: e.target.value })}
                                placeholder="Sala 1 - B.O. 2B"
                              />
                            ) : (
                              item.room_name
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {isAdmin ? (
                              <Input
                                value={item.specialty ?? ""}
                                onChange={(e) => updateSalaItem(item.id, { specialty: e.target.value })}
                                placeholder="Specialità"
                              />
                            ) : (
                              item.specialty
                            )}
                          </td>
                          {isAdmin ? (
                            <td className="px-2 py-1 text-right">
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeSalaItem(item.id)}>
                                Elimina
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Confermando, verrà creato un piano in bozza con tutte le voci. Nessun utente assegnato a questo step.
              </p>
              {isAdmin ? (
                <div className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2.5">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="overwrite"
                    checked={overwrite}
                    onChange={(e) => setOverwrite(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">Sovrascrivi se il piano per questo mese esiste già</span>
                    <span className="mt-0.5 block text-muted-foreground">
                      Rimuove il piano attuale e tutte le righe turno collegate, poi reimporta dal file. Usare solo se il
                      nuovo Excel deve sostituire del tutto il mese.
                    </span>
                  </span>
                </label>
                </div>
              ) : null}
              {importError ? (
                <div role="alert" className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p>{importError}</p>
                  {importDuplicateYearMonth ? (
                    <p>
                      <Link
                        href={`/turni?month=${encodeURIComponent(importDuplicateYearMonth)}`}
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                      >
                        Vai al mese
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {isAdmin ? (
                <Button
                  type="button"
                  className="mt-3"
                  onClick={runImport}
                  disabled={isPending}
                >
                  {isPending && preview ? "Import in corso…" : "Importa in produzione"}
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      ) : null}
      </form>

      <p className="text-sm text-muted-foreground">
        <Link href="/turni" className="text-primary underline-offset-2 hover:underline">
          Torna a Turni
        </Link>
      </p>
    </div>
  );
}
