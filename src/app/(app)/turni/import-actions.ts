"use server";

import { redirect } from "next/navigation";

import { importMonthlyPlanning, type ImportMonthlyPlanningResult } from "@/lib/data/monthly-shift-import";
import { getMonthlyShiftPlanByYearMonth } from "@/lib/data/monthly-shift-plans";
import { buildAllShiftItemsForImport, parsePlanningFile, type PlanningFilePreview, type ShiftItemDraft } from "@/lib/import/planning-parser";
import { requireSection, requireUser } from "@/lib/auth/get-current-user-profile";

function toInt(v: FormDataEntryValue | null, label: string): { ok: true; n: number } | { ok: false; error: string } {
  if (v == null || v === "") return { ok: false, error: `${label} mancante` };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, error: `${label} non valido` };
  return { ok: true, n: Math.trunc(n) };
}

/**
 * Anteprima senza scrittura DB. Solo **admin** (stesso criterio dell’import reale).
 */
export async function previewPlanningAction(
  formData: FormData,
): Promise<
  | { ok: true; preview: Extract<PlanningFilePreview, { ok: true }>; salaItems: ShiftItemDraft[]; canEdit: boolean }
  | { ok: false; error: string; canEdit: boolean }
> {
  const profile = await requireSection("turni");

  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "File mancante o vuoto", canEdit: profile.role === "admin" };
  }

  const y = toInt(formData.get("year"), "Anno");
  const m = toInt(formData.get("month"), "Mese");
  if (!y.ok) return { ok: false, error: y.error, canEdit: profile.role === "admin" };
  if (!m.ok) return { ok: false, error: m.error, canEdit: profile.role === "admin" };

  const buffer = await file.arrayBuffer();
  const preview = parsePlanningFile(buffer, y.n, m.n);
  if (!preview.ok) {
    return { ok: false, error: preview.error, canEdit: profile.role === "admin" };
  }
  const built = buildAllShiftItemsForImport(y.n, m.n, buffer);
  return { ok: true, preview, salaItems: built.sala.items, canEdit: profile.role === "admin" };
}

function parseEditedSalaItems(raw: FormDataEntryValue | null): ShiftItemDraft[] | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const out: ShiftItemDraft[] = [];
    for (const i of parsed) {
      if (!i || typeof i !== "object") continue;
      const item = i as Record<string, unknown>;
      if (item.kind !== "sala") continue;
      if (typeof item.shift_date !== "string" || typeof item.label !== "string") continue;
      if (item.period !== "mattina" && item.period !== "pomeriggio") continue;
      out.push({
        shift_date: item.shift_date,
        kind: "sala",
        period: item.period,
        start_time: typeof item.start_time === "string" ? item.start_time : null,
        end_time: typeof item.end_time === "string" ? item.end_time : null,
        label: item.label,
        room_name: typeof item.room_name === "string" ? item.room_name : null,
        specialty: typeof item.specialty === "string" ? item.specialty : null,
        source: "excel",
      });
    }
    return out;
  } catch {
    return null;
  }
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

  const overwrite = formData.get("overwrite") === "on";
  const editedSalaItems = parseEditedSalaItems(formData.get("editedSalaItems"));

  const buffer = await file.arrayBuffer();
  const result = await importMonthlyPlanning({
    year: y.n,
    month: m.n,
    fileBuffer: buffer,
    overwrite,
    overrideSalaItems: editedSalaItems ?? undefined,
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
  const profile = await requireUser();
  if (profile.role !== "admin") {
    return { exists: false, yearMonth: "" };
  }
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
