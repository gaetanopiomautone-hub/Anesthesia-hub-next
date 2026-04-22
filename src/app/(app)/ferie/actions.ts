"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import { feriePathWithContext, parseFerieContextFromForm } from "@/app/(app)/ferie/ferie-url-context";
import { requireUser } from "@/lib/auth/get-current-user-profile";
import { canAccess } from "@/lib/auth/permissions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const leaveRequestSchema = z.object({
  requestType: z.enum(["ferie", "desiderata", "vacation", "permission", "sick_leave", "conference", "other"]),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const leaveRequestUpdateSchema = leaveRequestSchema.extend({
  id: z.string().uuid(),
});

const leaveDecisionSchema = z.object({
  id: z.string().uuid(),
  adminNote: z.string().max(500).optional(),
});

const leaveCancelSchema = z.object({
  id: z.string().uuid(),
});

function redirectToFerieWithError(message: string, context?: { month?: string | null; day?: string | null; errorCode?: string }): never {
  redirect(
    feriePathWithContext({
      month: context?.month ?? null,
      day: context?.day ?? null,
      error: message,
      errorCode: context?.errorCode,
    }),
  );
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
  if (profile.role !== "tutor" && profile.role !== "admin") redirect("/forbidden");
  return profile;
}

function parseLeaveRequestForm(formData: FormData) {
  const result = leaveRequestSchema.safeParse({
    requestType: formData.get("requestType"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    reason: formData.get("reason") ?? formData.get("note"),
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
    reason: formData.get("reason") ?? formData.get("note"),
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

function parseLeaveCancelForm(formData: FormData) {
  const result = leaveCancelSchema.safeParse({
    id: formData.get("id"),
  });
  if (!result.success) {
    redirectToFerieWithError("Dati della richiesta non validi.");
  }
  return result.data;
}

function requireDateOrderOrRedirect(startDate: string, endDate: string) {
  if (new Date(startDate).getTime() > new Date(endDate).getTime()) {
    redirectToFerieWithError("La data di fine deve essere successiva o uguale alla data di inizio.");
  }
}

async function ensureNoLeaveOverlapOrRedirect(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userId: string;
  startDate: string;
  endDate: string;
  month: string | null;
  day?: string | null;
  excludeId?: string;
}) {
  let overlapQuery = params.supabase
    .from("leave_requests")
    .select("id")
    .eq("user_id", params.userId)
    .in("status", ["pending", "approved"])
    .lte("start_date", params.endDate)
    .gte("end_date", params.startDate)
    .limit(1);

  if (params.excludeId) {
    overlapQuery = overlapQuery.neq("id", params.excludeId);
  }

  const { data: overlapRows, error: overlapError } = await overlapQuery;

  if (overlapError) {
    redirectToFerieWithError(friendlyPostgresMessage(overlapError), { month: params.month, day: params.day });
  }

  if (overlapRows?.length) {
    redirectToFerieWithError("Hai già una richiesta ferie in questo periodo (anche parziale).", {
      month: params.month,
      day: params.day,
      errorCode: "overlap",
    });
  }
}

function revalidateLeaveViews() {
  revalidatePath("/ferie");
  revalidatePath("/turni-ferie");
  revalidatePath("/dashboard");
}

function normalizeLeaveRequestType(requestType: z.infer<typeof leaveRequestSchema>["requestType"]) {
  if (requestType === "ferie") return "vacation";
  if (requestType === "desiderata") return "other";
  return requestType;
}

export async function createLeaveRequestAction(formData: FormData) {
  const { month, day } = parseFerieContextFromForm(formData);
  const profile = await requireFerieTrainee();
  const parsed = parseLeaveRequestForm(formData);
  requireDateOrderOrRedirect(parsed.startDate, parsed.endDate);
  const requestType = normalizeLeaveRequestType(parsed.requestType);

  const supabase = await createServerSupabaseClient();
  await ensureNoLeaveOverlapOrRedirect({
    supabase,
    userId: profile.id,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    month,
    day,
  });

  const { error } = await supabase.from("leave_requests").insert({
    user_id: profile.id,
    request_type: requestType,
    start_date: parsed.startDate,
    end_date: parsed.endDate,
    status: "pending",
    reason: parsed.reason?.trim() ? parsed.reason.trim() : null,
    reviewed_by: null,
    reviewed_at: null,
  });

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error), { month, day });
  }

  revalidateLeaveViews();
  redirect(feriePathWithContext({ month, day, ok: "created" }));
}

export async function updateLeaveRequestAction(formData: FormData) {
  const { month, day } = parseFerieContextFromForm(formData);
  const profile = await requireFerieTrainee();
  const parsed = parseLeaveUpdateForm(formData);
  requireDateOrderOrRedirect(parsed.startDate, parsed.endDate);
  const requestType = normalizeLeaveRequestType(parsed.requestType);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id, user_id, status")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToFerieWithError("Richiesta non trovata o non accessibile.");
  }

  if (existing.user_id !== profile.id) {
    redirectToFerieWithError("Non puoi modificare richieste di altri utenti.");
  }

  if (existing.status !== "pending") {
    redirectToFerieWithError("Puoi modificare solo richieste ancora in attesa.");
  }

  await ensureNoLeaveOverlapOrRedirect({
    supabase,
    userId: profile.id,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    month,
    day,
    excludeId: parsed.id,
  });

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      request_type: requestType,
      start_date: parsed.startDate,
      end_date: parsed.endDate,
      reason: parsed.reason?.trim() ? parsed.reason.trim() : null,
    })
    .eq("id", parsed.id)
    .eq("user_id", profile.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error), { month, day });
  }

  if (!updated?.length) {
    redirectToFerieWithError("La richiesta non è più modificabile (potrebbe essere già stata elaborata).", { month, day });
  }

  revalidateLeaveViews();
  redirect(feriePathWithContext({ month, day, ok: "updated" }));
}

export async function approveLeaveRequestAction(formData: FormData) {
  const { month, day } = parseFerieContextFromForm(formData);
  const profile = await requireFerieApprover();
  const parsed = parseLeaveDecisionForm(formData);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id, status")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToFerieWithError("Richiesta non trovata o non accessibile.", { month, day });
  }

  if (existing.status !== "pending") {
    redirectToFerieWithError("Puoi approvare solo richieste ancora in attesa.", { month, day });
  }

  const reviewNote = parsed.adminNote?.trim();

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      ...(reviewNote ? { review_note: reviewNote } : {}),
    })
    .eq("id", parsed.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error), { month, day });
  }

  if (!updated?.length) {
    redirectToFerieWithError("Richiesta già elaborata o non più in attesa.", { month, day });
  }

  revalidateLeaveViews();
  redirect(feriePathWithContext({ month, day, ok: "approved" }));
}

export async function rejectLeaveRequestAction(formData: FormData) {
  const { month, day } = parseFerieContextFromForm(formData);
  const profile = await requireFerieApprover();
  const parsed = parseLeaveDecisionForm(formData);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id, status")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToFerieWithError("Richiesta non trovata o non accessibile.", { month, day });
  }

  if (existing.status !== "pending") {
    redirectToFerieWithError("Puoi rifiutare solo richieste ancora in attesa.", { month, day });
  }

  const reviewNote = parsed.adminNote?.trim();

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      status: "rejected",
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
      ...(reviewNote ? { review_note: reviewNote } : {}),
    })
    .eq("id", parsed.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error), { month, day });
  }

  if (!updated?.length) {
    redirectToFerieWithError("Richiesta già elaborata o non più in attesa.", { month, day });
  }

  revalidateLeaveViews();
  redirect(feriePathWithContext({ month, day, ok: "rejected" }));
}

export async function cancelLeaveRequestAction(formData: FormData) {
  const { month, day } = parseFerieContextFromForm(formData);
  const profile = await requireFerieTrainee();
  const parsed = parseLeaveCancelForm(formData);

  const supabase = await createServerSupabaseClient();

  const { data: existing, error: existingError } = await supabase
    .from("leave_requests")
    .select("id, user_id, status")
    .eq("id", parsed.id)
    .single();

  if (existingError || !existing) {
    redirectToFerieWithError("Richiesta non trovata o non accessibile.", { month, day });
  }

  if (existing.user_id !== profile.id) {
    redirectToFerieWithError("Non puoi annullare richieste di altri utenti.", { month, day });
  }

  if (existing.status !== "pending") {
    redirectToFerieWithError("Puoi annullare solo richieste ancora in attesa.", { month, day });
  }

  const { data: updated, error } = await supabase
    .from("leave_requests")
    .update({
      status: "cancelled",
      reviewed_by: null,
      reviewed_at: null,
    })
    .eq("id", parsed.id)
    .eq("user_id", profile.id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    redirectToFerieWithError(friendlyPostgresMessage(error), { month, day });
  }

  if (!updated?.length) {
    redirectToFerieWithError("Richiesta già elaborata o non più annullabile.", { month, day });
  }

  revalidateLeaveViews();
  redirect(feriePathWithContext({ month, day, ok: "cancelled" }));
}
