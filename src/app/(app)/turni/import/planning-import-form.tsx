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
import type { PlanningFilePreview } from "@/lib/import/planning-parser";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function PlanningImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [preview, setPreview] = useState<Extract<PlanningFilePreview, { ok: true }> | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importDuplicateYearMonth, setImportDuplicateYearMonth] = useState<string | null>(null);
  const [existingDbPlan, setExistingDbPlan] = useState<{ yearMonth: string; label: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
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
  }, [year, month]);

  const runPreview = () => {
    setPreviewError(null);
    setImportError(null);
    setImportDuplicateYearMonth(null);
    setPreview(null);
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
        setPreview(result);
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
            setImportError("Esiste già un planning per questo mese. Scegli un altro mese o rimuovi il piano esistente.");
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
      </form>

      {existingDbPlan ? (
        <div
          className="rounded-lg border border-amber-200/90 bg-amber-50/95 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p>
            <span className="font-medium">Esiste già un planning in database per {existingDbPlan.label}.</span> L’import
            andrebbe a creare un duplicato: cambia mese, elimina il piano, oppure apri il mese per modificarlo.
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
                <span className="font-medium tabular-nums">{preview.saleCount}</span>
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
                <span className="font-medium tabular-nums">{preview.totalItems}</span>
              </li>
            </ul>
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
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Confermando, verrà creato un piano in bozza con tutte le voci. Nessun utente assegnato a questo step.
              </p>
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
              <Button
                type="button"
                className="mt-3"
                onClick={runImport}
                disabled={isPending}
              >
                {isPending && preview ? "Import in corso…" : "Importa in produzione"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <p className="text-sm text-muted-foreground">
        <Link href="/turni" className="text-primary underline-offset-2 hover:underline">
          Torna a Turni
        </Link>
      </p>
    </div>
  );
}
