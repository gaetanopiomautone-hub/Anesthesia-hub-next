"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import { canAccess } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const logbookCreateSchema = z.object({
  performedOn: z.string().min(1),
  procedureCatalogId: z.string().uuid(),
  supervisionLevel: z.enum(["diretta", "indiretta", "assente"]),
  autonomyLevel: z.enum(["assistito", "con_supervisione", "autonomo"]),
  confidence: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
});

const logbookUpdateSchema = logbookCreateSchema.extend({
  id: z.string().uuid(),
});

const LOGBOOK_PATH = "/logbook";

function redirectToLogbookWithError(message: string): never {
  redirect(`${LOGBOOK_PATH}?error=${encodeURIComponent(message)}`);
}

function friendlyPostgresMessage(error: PostgrestError): string {
  switch (error.code) {
    case "23514":
      return "I dati non rispettano i vincoli di validazione sul server.";
    case "23505":
      return "Esiste già un record che impedisce questa operazione.";
    case "23503":
      return "Riferimento a un record non valido.";
    case "42501":
      return "Permessi insufficienti per completare l'operazione.";
    case "PGRST116":
      return "Record non trovato.";
    default:
      return "Operazione non riuscita. Riprova più tardi.";
  }
}

async function requireLogbookTrainee() {
  const profile = await requireUser();
  if (!canAccess(profile.role, "logbook")) redirect("/forbidden");
  if (profile.role !== "specializzando") redirect("/forbidden");
  return profile;
}

function parseLogbookCreateForm(formData: FormData) {
  const result = logbookCreateSchema.safeParse({
    performedOn: formData.get("performedOn"),
    procedureCatalogId: formData.get("procedureCatalogId"),
    supervisionLevel: formData.get("supervisionLevel"),
    autonomyLevel: formData.get("autonomyLevel"),
    confidence: formData.get("confidence"),
    notes: formData.get("notes"),
  });
  if (!result.success) {
    redirectToLogbookWithError("Controlla i campi del logbook e riprova.");
  }
  return result.data;
}

function parseLogbookUpdateForm(formData: FormData) {
  const result = logbookUpdateSchema.safeParse({
    id: formData.get("id"),
    performedOn: formData.get("performedOn"),
    procedureCatalogId: formData.get("procedureCatalogId"),
    supervisionLevel: formData.get("supervisionLevel"),
    autonomyLevel: formData.get("autonomyLevel"),
    confidence: formData.get("confidence"),
    notes: formData.get("notes"),
  });
  if (!result.success) {
    redirectToLogbookWithError("Controlla i campi del logbook e riprova.");
  }
  return result.data;
}

function revalidateLogbookRelated() {
  revalidatePath("/logbook");
  revalidatePath("/dashboard");
  revalidatePath("/report");
}

export async function createLogbookEntryAction(formData: FormData) {
  const profile = await requireLogbookTrainee();
  const parsed = parseLogbookCreateForm(formData);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("logbook_entries").insert({
    trainee_profile_id: profile.id,
    procedure_catalog_id: parsed.procedureCatalogId,
    performed_on: parsed.performedOn,
    supervision_level: parsed.supervisionLevel,
    autonomy_level: parsed.autonomyLevel,
    confidence_level: parsed.confidence,
    notes: parsed.notes?.trim() ? parsed.notes.trim() : null,
    patient_reference: null,
    clinical_location_id: null,
    supervisor_profile_id: null,
  });

  if (error) {
    redirectToLogbookWithError(friendlyPostgresMessage(error));
  }

  revalidateLogbookRelated();
  redirect(LOGBOOK_PATH);
}

export async function updateLogbookEntryAction(formData: FormData) {
  const profile = await requireLogbookTrainee();
  const parsed = parseLogbookUpdateForm(formData);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("logbook_entries")
    .select("id, trainee_profile_id")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToLogbookWithError("Voce non trovata o non accessibile.");
  }

  if (existing.trainee_profile_id !== profile.id) {
    redirectToLogbookWithError("Non puoi modificare voci di altri utenti.");
  }

  const { data: updated, error } = await supabase
    .from("logbook_entries")
    .update({
      procedure_catalog_id: parsed.procedureCatalogId,
      performed_on: parsed.performedOn,
      supervision_level: parsed.supervisionLevel,
      autonomy_level: parsed.autonomyLevel,
      confidence_level: parsed.confidence,
      notes: parsed.notes?.trim() ? parsed.notes.trim() : null,
      patient_reference: null,
    })
    .eq("id", parsed.id)
    .eq("trainee_profile_id", profile.id)
    .select("id");

  if (error) {
    redirectToLogbookWithError(friendlyPostgresMessage(error));
  }

  if (!updated?.length) {
    redirectToLogbookWithError("La voce non è più modificabile.");
  }

  revalidateLogbookRelated();
  redirect(LOGBOOK_PATH);
}
