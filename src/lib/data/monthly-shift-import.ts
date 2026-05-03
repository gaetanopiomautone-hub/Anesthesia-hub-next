import { requireRole } from "@/lib/auth/get-current-user-profile";
import { assertUserIdIsAssignableTrainee } from "@/lib/data/assignable-trainee-guard";
import type { ClinicalAreaLookup } from "@/lib/domain/clinical-area-resolve";
import { resolveClinicalAreaIdFromSalaDraft } from "@/lib/domain/clinical-area-resolve";
import { buildAllShiftItemsForImport } from "@/lib/import/planning-parser";
import type { ShiftItemDraft } from "@/lib/import/planning-parser";
import { getMonthlyShiftPlanByYearMonth } from "@/lib/data/monthly-shift-plans";
import { insertPlanningChangeLogs } from "@/lib/data/planning-change-log";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { MonthlyShiftPlanRow } from "@/lib/domain/monthly-shifts";
import { createClient } from "@supabase/supabase-js";

const INSERT_CHUNK = 200;

function createServiceRoleSupabaseClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey);
}

type InsertRow = {
  plan_id: string;
  shift_date: string;
  kind: ShiftItemDraft["kind"];
  period: ShiftItemDraft["period"];
  start_time: string | null;
  end_time: string | null;
  label: string;
  room_name: string | null;
  specialty: string | null;
  clinical_area_id: string | null;
  source: ShiftItemDraft["source"];
  assigned_to: string | null;
};

type InsertedShiftItemRowForAudit = {
  id: string;
  plan_id: string;
  shift_date: string;
  kind: ShiftItemDraft["kind"];
  period: ShiftItemDraft["period"];
  room_name: string | null;
  specialty: string | null;
  clinical_area_id: string | null;
  assigned_to: string | null;
};

function toInsertRows(planId: string, drafts: ShiftItemDraft[], activeAreas: ClinicalAreaLookup[]): InsertRow[] {
  return drafts.map((d) => ({
    plan_id: planId,
    shift_date: d.shift_date,
    kind: d.kind,
    period: d.period,
    start_time: d.start_time,
    end_time: d.end_time,
    label: d.label,
    room_name: d.room_name,
    specialty: d.specialty,
    clinical_area_id: resolveClinicalAreaIdFromSalaDraft(d, activeAreas),
    source: d.source,
    assigned_to:
      typeof d.assigned_to === "string" && d.assigned_to.trim().length > 0 ? d.assigned_to.trim() : null,
  }));
}

export type ImportMonthlyPlanningResult =
  | {
      ok: true;
      plan: MonthlyShiftPlanRow;
      itemCount: number;
      parsedRows: number;
      skippedRows: number;
    }
  | { ok: false; error: string; code: "ALREADY_EXISTS" | "DB" | "INVALID_ASSIGNEE" };

/**
 * Crea un `monthly_shift_plans` e popola `shift_items` (sale + ambulatorio + reperibilità) da Excel.
 * RLS: solo **admin** può inserire (bulk con service role). Se un draft porta `assigned_to`, lo si valida
 * prima della scrittura con {@link assertUserIdIsAssignableTrainee} (lettura profilo via service role), come sulle modifiche puntuali da sessione.
 */
export async function importMonthlyPlanning(params: {
  year: number;
  month: number;
  fileBuffer: ArrayBuffer;
  /** Se true: elimina piano + righe (cascade) e reimporta. Solo admin (server). */
  overwrite?: boolean;
  extraHolidayYmds?: string[];
  /** Slot sala modificati manualmente in anteprima admin. */
  overrideSalaItems?: ShiftItemDraft[];
}): Promise<ImportMonthlyPlanningResult> {
  const profile = await requireRole(["admin"]);
  const { year, month, fileBuffer, overwrite = false, extraHolidayYmds, overrideSalaItems } = params;

  const supabaseAdmin = createServiceRoleSupabaseClient();

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("monthly_shift_plans")
    .select("id")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (existingErr) {
    return { ok: false, error: existingErr.message, code: "DB" };
  }
  if (existing) {
    const existingId = String((existing as { id: string }).id);
    if (overwrite) {
      const { error: delErr } = await supabaseAdmin.from("monthly_shift_plans").delete().eq("id", existingId);
      if (delErr) {
        return { ok: false, error: delErr.message, code: "DB" };
      }
    } else {
      return {
        ok: false,
        error:
          "Esiste già un piano per l’anno e il mese indicati. Per sostituirlo, usa l’opzione di sovrascrittura nell’import.",
        code: "ALREADY_EXISTS",
      };
    }
  }

  const built = buildAllShiftItemsForImport(year, month, fileBuffer, { extraHolidayYmds });
  const salaItems = (overrideSalaItems ?? built.sala.items).filter((s) => s.kind === "sala");
  const all = [...salaItems, ...built.ambulatorio, ...built.onCallItems];

  const distinctAssignees = [...new Set(
    all.flatMap((d) => {
      const id = d.assigned_to;
      return typeof id === "string" && id.trim().length > 0 ? [id.trim()] : [];
    }),
  )];
  try {
    for (const uid of distinctAssignees) {
      await assertUserIdIsAssignableTrainee(uid);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg, code: "INVALID_ASSIGNEE" };
  }

  const { data: areaRows, error: areaErr } = await supabaseAdmin
    .from("clinical_areas")
    .select("id, code, name")
    .eq("is_active", true);
  if (areaErr) {
    return { ok: false, error: areaErr.message, code: "DB" };
  }
  const activeAreas = (areaRows ?? []) as ClinicalAreaLookup[];

  const { data: inserted, error: insertPlanErr } = await supabaseAdmin
    .from("monthly_shift_plans")
    .insert({
      year,
      month,
      status: "draft",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (insertPlanErr || !inserted) {
    const msg = insertPlanErr?.message ?? "Inserimento piano non riuscito";
    if (msg.toLowerCase().includes("duplicate key") || msg.includes("monthly_shift_plans_year_month_key")) {
      return {
        ok: false,
        error:
          "Esiste già un piano per questo mese. Se vuoi sostituirlo, abilita la sovrascrittura e riprova.",
        code: "ALREADY_EXISTS",
      };
    }
    return { ok: false, error: msg, code: "DB" };
  }

  const planId = String((inserted as { id: string }).id);
  if (!planId) {
    return { ok: false, error: "ID piano mancante.", code: "DB" };
  }

  const rows = toInsertRows(planId, all, activeAreas);
  const importedAuditRows: InsertedShiftItemRowForAudit[] = [];
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { data: insertedChunk, error: itemsErr } = await supabaseAdmin
      .from("shift_items")
      .insert(chunk)
      .select("id,plan_id,shift_date,kind,period,room_name,specialty,clinical_area_id,assigned_to");
    if (itemsErr) {
      await supabaseAdmin.from("monthly_shift_plans").delete().eq("id", planId);
      return { ok: false, error: `shift_items: ${itemsErr.message}`, code: "DB" };
    }
    importedAuditRows.push(...((insertedChunk ?? []) as InsertedShiftItemRowForAudit[]));
  }

  try {
    await insertPlanningChangeLogs(
      importedAuditRows.map((row) => ({
        planning_month_id: row.plan_id,
        shift_id: row.id,
        actor_user_id: profile.id,
        action: "imported" as const,
        before_data: null,
        after_data: {
          shift_date: row.shift_date,
          kind: row.kind,
          period: row.period,
          room_name: row.room_name,
          specialty: row.specialty,
          clinical_area_id: row.clinical_area_id,
          assigned_to: row.assigned_to,
        },
      })),
    );
  } catch (e) {
    // Audit must never block production import.
    // eslint-disable-next-line no-console
    console.error("Audit failed, continuing import", e);
  }

  const plan = await getMonthlyShiftPlanByYearMonth({ year, month, supabase: supabaseAdmin });
  if (!plan) {
    return { ok: false, error: "Piano inserito ma non recuperabile.", code: "DB" };
  }

  return {
    ok: true,
    plan,
    itemCount: all.length,
    parsedRows: salaItems.length,
    skippedRows: built.sala.skippedRows,
  };
}
