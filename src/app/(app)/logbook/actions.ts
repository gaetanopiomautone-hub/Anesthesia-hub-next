"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import { canAccess } from "@/lib/auth/permissions";
import {
  probeLogbookProcedureColumn,
  probeLogbookTraineeFilterColumn,
} from "@/lib/data/logbook";
import {
  LOGBOOK_PARTICIPATION_ROLE_VALUES,
  type LogbookParticipationRole,
} from "@/lib/domain/logbook-participation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const logbookCreateSchema = z.object({
  performedOn: z.string().min(1),
  procedureCatalogId: z.string().uuid(),
  participationRole: z.enum(LOGBOOK_PARTICIPATION_ROLE_VALUES),
  quantity: z.coerce.number().int().min(1).max(999),
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

function legacyLevelsFromParticipation(role: LogbookParticipationRole): {
  supervision_level: "diretta" | "indiretta" | "assente";
  autonomy_level: "assistito" | "con_supervisione" | "autonomo";
} {
  switch (role) {
    case "osservato":
      return { supervision_level: "indiretta", autonomy_level: "assistito" };
    case "assistito":
      return { supervision_level: "diretta", autonomy_level: "assistito" };
    case "eseguito_supervisionato":
      return { supervision_level: "diretta", autonomy_level: "con_supervisione" };
    case "eseguito_autonomamente":
      return { supervision_level: "assente", autonomy_level: "autonomo" };
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
    participationRole: formData.get("participationRole"),
    quantity: formData.get("quantity"),
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
    participationRole: formData.get("participationRole"),
    quantity: formData.get("quantity"),
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
  const legacy = legacyLevelsFromParticipation(parsed.participationRole);

  const supabase = await createServerSupabaseClient();
  const [traineeCol, procedureCol] = await Promise.all([
    probeLogbookTraineeFilterColumn(supabase),
    probeLogbookProcedureColumn(supabase),
  ]);
  const { error } = await supabase.from("logbook_entries").insert({
    [traineeCol]: profile.id,
    [procedureCol]: parsed.procedureCatalogId,
    performed_on: parsed.performedOn,
    participation_role: parsed.participationRole,
    quantity: parsed.quantity,
    supervision_level: legacy.supervision_level,
    autonomy_level: legacy.autonomy_level,
    confidence_level: 3,
    notes: parsed.notes?.trim() ? parsed.notes.trim() : null,
    patient_reference: null,
    clinical_location_id: null,
    supervisor_profile_id: null,
  } as Record<string, unknown>);

  if (error) {
    redirectToLogbookWithError(friendlyPostgresMessage(error));
  }

  revalidateLogbookRelated();
  redirect(LOGBOOK_PATH);
}

export async function updateLogbookEntryAction(formData: FormData) {
  const profile = await requireLogbookTrainee();
  const parsed = parseLogbookUpdateForm(formData);
  const legacy = legacyLevelsFromParticipation(parsed.participationRole);

  const supabase = await createServerSupabaseClient();
  const [traineeCol, procedureCol] = await Promise.all([
    probeLogbookTraineeFilterColumn(supabase),
    probeLogbookProcedureColumn(supabase),
  ]);

  const { data: existing, error: existingError } = await supabase
    .from("logbook_entries")
    .select(`id, ${traineeCol}`)
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToLogbookWithError("Voce non trovata o non accessibile.");
  }

  const ownerId = String((existing as Record<string, unknown>)[traineeCol] ?? "").trim();
  if (ownerId !== profile.id) {
    redirectToLogbookWithError("Non puoi modificare voci di altri utenti.");
  }

  const { data: updated, error } = await supabase
    .from("logbook_entries")
    .update({
      [procedureCol]: parsed.procedureCatalogId,
      performed_on: parsed.performedOn,
      participation_role: parsed.participationRole,
      quantity: parsed.quantity,
      supervision_level: legacy.supervision_level,
      autonomy_level: legacy.autonomy_level,
      notes: parsed.notes?.trim() ? parsed.notes.trim() : null,
      patient_reference: null,
    })
    .eq("id", parsed.id)
    .eq(traineeCol, profile.id)
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
