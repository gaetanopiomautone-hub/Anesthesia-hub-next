"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import { canAccess } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const leaveRequestSchema = z.object({
  requestType: z.enum(["ferie", "desiderata"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  note: z.string().max(500).optional(),
});

const leaveRequestUpdateSchema = leaveRequestSchema.extend({
  id: z.string().uuid(),
});

const leaveDecisionSchema = z.object({
  id: z.string().uuid(),
  adminNote: z.string().max(500).optional(),
});

const FERIE_PATH = "/ferie";

function redirectToFerieWithError(message: string): never {
  redirect(`${FERIE_PATH}?error=${encodeURIComponent(message)}`);
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

async function requireFerieTrainee() {
  const profile = await requireUser();
  if (!canAccess(profile.role, "ferie")) redirect("/forbidden");
  if (profile.role !== "specializzando") redirect("/forbidden");
  return profile;
}

async function requireFerieApprover() {
  const profile = await requireUser();
  if (!canAccess(profile.role, "ferie")) redirect("/forbidden");
  if (profile.role !== "addetto_turni" && profile.role !== "amministratore") redirect("/forbidden");
  return profile;
}

function parseLeaveRequestForm(formData: FormData) {
  const result = leaveRequestSchema.safeParse({
    requestType: formData.get("requestType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    note: formData.get("note"),
  });
  if (!result.success) {
    redirectToFerieWithError("Controlla i campi della richiesta e riprova.");
  }
  return result.data;
}

function parseLeaveUpdateForm(formData: FormData) {
  const result = leaveRequestUpdateSchema.safeParse({
    id: formData.get("id"),
    requestType: formData.get("requestType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    note: formData.get("note"),
  });
  if (!result.success) {
    redirectToFerieWithError("Controlla i campi della richiesta e riprova.");
  }
  return result.data;
}

function parseLeaveDecisionForm(formData: FormData) {
  const result = leaveDecisionSchema.safeParse({
    id: formData.get("id"),
    adminNote: formData.get("adminNote"),
  });
  if (!result.success) {
    redirectToFerieWithError("Dati della decisione non validi.");
  }
  return result.data;
}

function requireDateOrderOrRedirect(startDate: string, endDate: string) {
  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    redirectToFerieWithError("La data di fine deve essere successiva o uguale alla data di inizio.");
  }
}

function revalidateLeaveViews() {
  revalidatePath("/ferie");
  revalidatePath("/dashboard");
}

export async function createLeaveRequestAction(formData: FormData) {
  const profile = await requireFerieTrainee();
  const parsed = parseLeaveRequestForm(formData);
  requireDateOrderOrRedirect(parsed.startDate, parsed.endDate);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("leave_requests").insert({
    requester_profile_id: profile.id,
    request_type: parsed.requestType,
    start_date: parsed.startDate,
    end_date: parsed.endDate,
    status: "in_attesa",
    note: parsed.note?.trim() ? parsed.note.trim() : null,
    approved_by: null,
    approved_at: null,
  });

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error));
  }

  revalidateLeaveViews();
  redirect(FERIE_PATH);
}

export async function updateLeaveRequestAction(formData: FormData) {
  const profile = await requireFerieTrainee();
  const parsed = parseLeaveUpdateForm(formData);
  requireDateOrderOrRedirect(parsed.startDate, parsed.endDate);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id, requester_profile_id, status")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToFerieWithError("Richiesta non trovata o non accessibile.");
  }

  if (existing.requester_profile_id !== profile.id) {
    redirectToFerieWithError("Non puoi modificare richieste di altri utenti.");
  }

  if (existing.status !== "in_attesa") {
    redirectToFerieWithError("Puoi modificare solo richieste ancora in attesa.");
  }

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      request_type: parsed.requestType,
      start_date: parsed.startDate,
      end_date: parsed.endDate,
      note: parsed.note?.trim() ? parsed.note.trim() : null,
    })
    .eq("id", parsed.id)
    .eq("requester_profile_id", profile.id)
    .eq("status", "in_attesa")
    .select("id");

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error));
  }

  if (!updated?.length) {
    redirectToFerieWithError("La richiesta non è più modificabile (potrebbe essere già stata elaborata).");
  }

  revalidateLeaveViews();
  redirect(FERIE_PATH);
}

export async function approveLeaveRequestAction(formData: FormData) {
  const profile = await requireFerieApprover();
  const parsed = parseLeaveDecisionForm(formData);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id, status, note")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToFerieWithError("Richiesta non trovata o non accessibile.");
  }

  if (existing.status !== "in_attesa") {
    redirectToFerieWithError("Puoi approvare solo richieste ancora in attesa.");
  }

  const adminNote = parsed.adminNote?.trim();
  const mergedNote =
    adminNote && adminNote.length > 0
      ? [existing.note?.trim() ? existing.note.trim() : null, `Nota approvazione: ${adminNote}`].filter(Boolean).join("\n\n")
      : undefined;

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      status: "approvato",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      ...(mergedNote ? { note: mergedNote } : {}),
    })
    .eq("id", parsed.id)
    .eq("status", "in_attesa")
    .select("id");

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error));
  }

  if (!updated?.length) {
    redirectToFerieWithError("Richiesta già elaborata o non più in attesa.");
  }

  revalidateLeaveViews();
  redirect(FERIE_PATH);
}

export async function rejectLeaveRequestAction(formData: FormData) {
  const profile = await requireFerieApprover();
  const parsed = parseLeaveDecisionForm(formData);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id, status, note")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToFerieWithError("Richiesta non trovata o non accessibile.");
  }

  if (existing.status !== "in_attesa") {
    redirectToFerieWithError("Puoi rifiutare solo richieste ancora in attesa.");
  }

  const adminNote = parsed.adminNote?.trim();
  const mergedNote =
    adminNote && adminNote.length > 0
      ? [existing.note?.trim() ? existing.note.trim() : null, `Motivo rifiuto: ${adminNote}`].filter(Boolean).join("\n\n")
      : undefined;

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      status: "rifiutato",
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
      ...(mergedNote ? { note: mergedNote } : {}),
    })
    .eq("id", parsed.id)
    .eq("status", "in_attesa")
    .select("id");

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error));
  }

  if (!updated?.length) {
    redirectToFerieWithError("Richiesta già elaborata o non più in attesa.");
  }

  revalidateLeaveViews();
  redirect(FERIE_PATH);
}
