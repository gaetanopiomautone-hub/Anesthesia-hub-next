"use server";

import { redirect } from "next/navigation";

import { importMonthlyPlanning, type ImportMonthlyPlanningResult } from "@/lib/data/monthly-shift-import";
import { getMonthlyShiftPlanByYearMonth } from "@/lib/data/monthly-shift-plans";
import { parsePlanningFile, type PlanningFilePreview } from "@/lib/import/planning-parser";
import { requireRole } from "@/lib/auth/get-current-user-profile";

function toInt(v: FormDataEntryValue | null, label: string): { ok: true; n: number } | { ok: false; error: string } {
  if (v == null || v === "") return { ok: false, error: `${label} mancante` };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} non valido` };
  return { ok: true, n: Math.trunc(n) };
}

/**
 * Anteprima senza scrittura DB. Solo **admin** (stesso criterio dell’import reale).
 */
export async function previewPlanningAction(formData: FormData): Promise<PlanningFilePreview> {
  await requireRole(["admin"]);

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "File mancante o vuoto" };
  }

  const y = toInt(formData.get("year"), "Anno");
  const m = toInt(formData.get("month"), "Mese");
  if (!y.ok) return { ok: false, error: y.error };
  if (!m.ok) return { ok: false, error: m.error };

  const buffer = await file.arrayBuffer();
  return parsePlanningFile(buffer, y.n, m.n);
}

/**
 * Import definitivo. In caso di successo esegue **redirect** a `/turni`.
 */
export async function importPlanningAction(
  formData: FormData,
): Promise<ImportMonthlyPlanningResult | { ok: false; error: string; code: "FILE" }> {
  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "File mancante o vuoto", code: "FILE" as const };
  }

  const y = toInt(formData.get("year"), "Anno");
  const m = toInt(formData.get("month"), "Mese");
  if (!y.ok) return { ok: false, error: y.error, code: "FILE" };
  if (!m.ok) return { ok: false, error: m.error, code: "FILE" };

  const buffer = await file.arrayBuffer();
  const result = await importMonthlyPlanning({
    year: y.n,
    month: m.n,
    fileBuffer: buffer,
  });

  if (result.ok) {
    const ym = `${result.plan.year}-${String(result.plan.month).padStart(2, "0")}`;
    redirect(`/turni?ok=import_done&month=${encodeURIComponent(ym)}`);
  }

  return result;
}

/** Lato import UI: verifica se esiste già un piano mese in DB. */
export async function checkMonthlyPlanExistsAction(
  year: number,
  month: number,
): Promise<{ exists: boolean; yearMonth: string }> {
  await requireRole(["admin"]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { exists: false, yearMonth: "" };
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { exists: false, yearMonth: "" };
  }
  const existing = await getMonthlyShiftPlanByYearMonth({ year, month });
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
  return { exists: existing != null, yearMonth };
}
