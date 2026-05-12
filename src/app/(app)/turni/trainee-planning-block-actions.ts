"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import { humanizePostgrestRlsError } from "@/lib/domain/shift-rules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodSchema = z.enum(["morning", "afternoon", "full_day"]);
const kindSchema = z.enum(["didattica", "congresso", "desiderata", "altro"]);

export type AddTraineePlanningBlockState = { ok: true } | { ok: false; error: string };

export async function addTraineePlanningBlockAction(
  _prev: AddTraineePlanningBlockState | null,
  formData: FormData,
): Promise<AddTraineePlanningBlockState> {
  const profile = await requireUser();
  const fail = (msg: string): AddTraineePlanningBlockState => ({ ok: false, error: msg });

  const month = String(formData.get("month") ?? "").trim();
  const blockDate = String(formData.get("blockDate") ?? "").trim();
  const periodRaw = String(formData.get("period") ?? "").trim();
  const kindRaw = String(formData.get("kind") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const userIdRaw = String(formData.get("userId") ?? "").trim();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Mese non valido.");

  try {
    isoDateSchema.parse(blockDate);
    const period = periodSchema.parse(periodRaw);
    const kind = kindSchema.parse(kindRaw);
    z.string().uuid().parse(userIdRaw);
    if (title.length < 1) return fail("Inserisci un titolo o descrizione breve.");

    if (profile.role === "specializzando" && userIdRaw !== profile.id) {
      return fail("Puoi registrare solo i tuoi blocchi.");
    }
    if (profile.role !== "admin" && profile.role !== "specializzando") {
      return fail("Operazione non consentita per il tuo ruolo.");
    }

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("trainee_planning_blocks").insert({
      user_id: userIdRaw,
      block_date: blockDate,
      period,
      kind,
      title,
      note: null,
    });

    if (error) {
      if (/relation|does not exist|schema cache/i.test(error.message)) {
        return fail(
          "Tabella blocchi non presente: applica la migrazione `20260511233000_trainee_planning_blocks.sql` su Supabase.",
        );
      }
      return fail(humanizePostgrestRlsError(error.message));
    }

    revalidatePath("/turni");
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return fail("Dati non validi.");
    return fail(e instanceof Error ? e.message : "Errore imprevisto");
  }
}
