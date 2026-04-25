import { requireRole } from "@/lib/auth/get-current-user-profile";
import { buildAllShiftItemsForImport } from "@/lib/import/planning-parser";
import type { ShiftItemDraft } from "@/lib/import/planning-parser";
import { getMonthlyShiftPlanByYearMonth } from "@/lib/data/monthly-shift-plans";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
  source: ShiftItemDraft["source"];
};

function toInsertRows(planId: string, drafts: ShiftItemDraft[]): InsertRow[] {
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
    source: d.source,
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
  | { ok: false; error: string; code: "ALREADY_EXISTS" | "DB" };

/**
 * Crea un `monthly_shift_plans` e popola `shift_items` (sale + ambulatorio + reperibilità) da Excel.
 * RLS: solo **admin** può inserire. Nessuna assegnazione utente.
 */
export async function importMonthlyPlanning(params: {
  year: number;
  month: number;
  fileBuffer: ArrayBuffer;
  extraHolidayYmds?: string[];
}): Promise<ImportMonthlyPlanningResult> {
  const profile = await requireRole(["admin"]);
  const { year, month, fileBuffer, extraHolidayYmds } = params;

  const supabase = await createServerSupabaseClient();
  const supabaseAdmin = createServiceRoleSupabaseClient();

  const { data: existing, error: existingErr } = await supabase
    .from("monthly_shift_plans")
    .select("id")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (existingErr) {
    return { ok: false, error: existingErr.message, code: "DB" };
  }
  if (existing) {
    return {
      ok: false,
      error: "Esiste già un piano per l’anno e il mese indicati.",
      code: "ALREADY_EXISTS",
    };
  }

  const { sala, all } = buildAllShiftItemsForImport(year, month, fileBuffer, { extraHolidayYmds });

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
    return { ok: false, error: insertPlanErr?.message ?? "Inserimento piano non riuscito", code: "DB" };
  }

  const planId = String((inserted as { id: string }).id);
  if (!planId) {
    return { ok: false, error: "ID piano mancante.", code: "DB" };
  }

  const rows = toInsertRows(planId, all);
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    const { error: itemsErr } = await supabaseAdmin.from("shift_items").insert(chunk);
    if (itemsErr) {
      await supabaseAdmin.from("monthly_shift_plans").delete().eq("id", planId);
      return { ok: false, error: `shift_items: ${itemsErr.message}`, code: "DB" };
    }
  }

  const plan = await getMonthlyShiftPlanByYearMonth({ year, month });
  if (!plan) {
    return { ok: false, error: "Piano inserito ma non recuperabile.", code: "DB" };
  }

  return {
    ok: true,
    plan,
    itemCount: all.length,
    parsedRows: sala.parsedRows,
    skippedRows: sala.skippedRows,
  };
}
