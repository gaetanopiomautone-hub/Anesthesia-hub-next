"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import { canApproveShifts, canEditShiftProposal, canProposeShifts } from "@/lib/domain/shift-permissions";
import { normalizeShiftStatus } from "@/lib/domain/shift-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeDayInMonth } from "@/lib/dates/day-in-month";
import { getMonthContext } from "@/lib/dates/getMonthContext";

const shiftAssignSchema = z.object({
  shiftId: z.string().min(1),
  userId: z.string().uuid(),
  month: z.string().optional(),
  day: z.string().optional(),
});
const shiftRejectSchema = z.object({
  shiftId: z.string().min(1),
  reason: z.string().max(400).optional(),
  month: z.string().optional(),
  day: z.string().optional(),
});

function turniPathWithContext(month: string, day?: string | null, ok?: string, error?: string) {
  const params = new URLSearchParams();
  params.set("month", month);
  if (day) params.set("day", day);
  if (ok) params.set("ok", ok);
  if (error) params.set("error", error);
  return `/turni?${params.toString()}`;
}

async function loadShiftForUpdate(shiftId: string) {
  const supabase = await createServerSupabaseClient();
  const { data: shift, error: shiftError } = await supabase.from("shifts").select("*").eq("id", shiftId).single();
  return { supabase, shift, shiftError };
}

function resolveShiftAssigneeColumn(shiftRow: Record<string, unknown>) {
  if ("user_id" in shiftRow) return "user_id";
  if ("assignee_profile_id" in shiftRow) return "assignee_profile_id";
  if ("assignee_id" in shiftRow) return "assignee_id";
  return null;
}

function resolveShiftDateColumn(shiftRow: Record<string, unknown>) {
  if ("shift_date" in shiftRow) return "shift_date";
  if ("date" in shiftRow) return "date";
  return null;
}

async function ensureNoSameDayConflict(params: {
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  shiftId: string;
  shiftDate: string;
  shiftDateColumn: string;
  assigneeColumn: string;
  assigneeProfileId: string;
  shiftRow: Record<string, unknown>;
}) {
  let conflictQuery = params.supabase
    .from("shifts")
    .select("id")
    .eq(params.shiftDateColumn, params.shiftDate)
    .eq(params.assigneeColumn, params.assigneeProfileId)
    .neq("id", params.shiftId)
    .limit(1);
  if ("shift_kind" in params.shiftRow) {
    conflictQuery = conflictQuery.in("shift_kind", ["mattina", "pomeriggio", "notte"]);
  } else if ("shift_type" in params.shiftRow) {
    conflictQuery = conflictQuery.in("shift_type", ["mattina", "pomeriggio", "notte"]);
  }
  const { data: conflictRows, error: conflictError } = await conflictQuery;
  if (conflictError) {
    return "Errore durante il controllo conflitti.";
  }
  if (conflictRows?.length) {
    return "L'utente ha già un turno in quel giorno.";
  }
  return null;
}

function resolveMonthAndDay(formData: FormData) {
  const parsed = shiftAssignSchema.safeParse({
    shiftId: formData.get("shiftId"),
    userId: formData.get("userId"),
    month: formData.get("month"),
    day: formData.get("day"),
  });

  const monthContext = getMonthContext(typeof formData.get("month") === "string" ? String(formData.get("month")) : undefined);
  const month = monthContext.yearMonth;
  const day = normalizeDayInMonth(typeof formData.get("day") === "string" ? String(formData.get("day")) : undefined, month);
  return { parsed, month, day };
}

export async function saveShiftDraftAction(formData: FormData) {
  const { parsed, month, day } = resolveMonthAndDay(formData);
  if (!parsed.success) {
    redirect(turniPathWithContext(month, day, undefined, "Dati bozza non validi."));
  }
  const profile = await requireUser();
  if (!canProposeShifts(profile)) {
    redirect("/forbidden");
  }
  const { supabase, shift, shiftError } = await loadShiftForUpdate(parsed.data.shiftId);
  if (shiftError || !shift) {
    redirect(turniPathWithContext(month, day, undefined, "Turno non trovato."));
  }
  const shiftRow = shift as Record<string, unknown>;
  const assigneeColumn = resolveShiftAssigneeColumn(shiftRow);
  const shiftDateColumn = resolveShiftDateColumn(shiftRow);
  if (!assigneeColumn) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non compatibile con assegnazione utente."));
  }
  if (!shiftDateColumn) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non compatibile con data turno."));
  }
  if (!canEditShiftProposal({ user: profile, shift: shiftRow })) {
    redirect(turniPathWithContext(month, day, undefined, "Non puoi modificare questa proposta."));
  }
  const updatePayload: Record<string, unknown> = { [assigneeColumn]: parsed.data.userId };
  const shiftDate = String((shiftRow[shiftDateColumn] ?? "")).trim();
  if ("date" in shiftRow && !String(shiftRow.date ?? "").trim() && shiftDate) {
    updatePayload.date = shiftDate;
  }
  if ("status" in shiftRow) updatePayload.status = "draft";
  if ("proposed_by" in shiftRow && !shiftRow.proposed_by) updatePayload.proposed_by = profile.id;
  const { error: updateError } = await supabase.from("shifts").update(updatePayload).eq("id", parsed.data.shiftId);
  if (updateError) {
    redirect(turniPathWithContext(month, day, undefined, `Salvataggio bozza non riuscito: ${updateError.message}`));
  }
  revalidatePath("/turni");
  revalidatePath("/turni-ferie");
  redirect(turniPathWithContext(month, day, "draft_saved"));
}

export async function submitShiftProposalAction(formData: FormData) {
  const { parsed, month, day } = resolveMonthAndDay(formData);
  if (!parsed.success) {
    redirect(turniPathWithContext(month, day, undefined, "Dati proposta non validi."));
  }
  const profile = await requireUser();
  if (!canProposeShifts(profile)) {
    redirect("/forbidden");
  }
  const { supabase, shift, shiftError } = await loadShiftForUpdate(parsed.data.shiftId);
  if (shiftError || !shift) {
    redirect(turniPathWithContext(month, day, undefined, "Turno non trovato."));
  }
  const shiftRow = shift as Record<string, unknown>;
  const assigneeColumn = resolveShiftAssigneeColumn(shiftRow);
  const shiftDateColumn = resolveShiftDateColumn(shiftRow);
  if (!assigneeColumn) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non compatibile con assegnazione utente."));
  }
  if (!shiftDateColumn) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non compatibile con data turno."));
  }
  if (!canEditShiftProposal({ user: profile, shift: shiftRow })) {
    redirect(turniPathWithContext(month, day, undefined, "Non puoi inviare questa proposta."));
  }
  const shiftDate = String((shiftRow[shiftDateColumn] ?? "")).trim();
  if (!shiftDate) {
    redirect(turniPathWithContext(month, day, undefined, "Turno non valido (data mancante)."));
  }
  const conflictError = await ensureNoSameDayConflict({
    supabase,
    shiftId: parsed.data.shiftId,
    shiftDate,
    shiftDateColumn,
    assigneeColumn,
    assigneeProfileId: parsed.data.userId,
    shiftRow,
  });
  if (conflictError) {
    redirect(turniPathWithContext(month, day, undefined, conflictError));
  }
  const updatePayload: Record<string, unknown> = { [assigneeColumn]: parsed.data.userId };
  if ("date" in shiftRow && !String(shiftRow.date ?? "").trim() && shiftDate) {
    updatePayload.date = shiftDate;
  }
  if ("status" in shiftRow) updatePayload.status = "submitted";
  if ("proposed_by" in shiftRow) updatePayload.proposed_by = profile.id;
  if ("submitted_at" in shiftRow) updatePayload.submitted_at = new Date().toISOString();
  const { error: updateError } = await supabase.from("shifts").update(updatePayload).eq("id", parsed.data.shiftId);
  if (updateError) {
    redirect(turniPathWithContext(month, day, undefined, `Invio proposta non riuscito: ${updateError.message}`));
  }
  revalidatePath("/turni");
  revalidatePath("/turni-ferie");
  redirect(turniPathWithContext(month, day, "submitted"));
}

export async function approveShiftAction(formData: FormData) {
  const { parsed, month, day } = resolveMonthAndDay(formData);
  if (!parsed.success) {
    redirect(turniPathWithContext(month, day, undefined, "Dati approvazione non validi."));
  }
  const profile = await requireUser();
  if (!canApproveShifts(profile)) {
    redirect("/forbidden");
  }
  const { supabase, shift, shiftError } = await loadShiftForUpdate(parsed.data.shiftId);
  if (shiftError || !shift) {
    redirect(turniPathWithContext(month, day, undefined, "Turno non trovato."));
  }
  const shiftRow = shift as Record<string, unknown>;
  const assigneeColumn = resolveShiftAssigneeColumn(shiftRow);
  const shiftDateColumn = resolveShiftDateColumn(shiftRow);
  if (!assigneeColumn) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non compatibile con assegnazione utente."));
  }
  if (!shiftDateColumn) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non compatibile con data turno."));
  }
  const assigneeId = String((shiftRow[assigneeColumn] ?? parsed.data.userId) || "").trim();
  const shiftDate = String((shiftRow[shiftDateColumn] ?? "")).trim();
  if (!assigneeId || !shiftDate) {
    redirect(turniPathWithContext(month, day, undefined, "Proposta non valida: assegnatario o data mancanti."));
  }
  const conflictError = await ensureNoSameDayConflict({
    supabase,
    shiftId: parsed.data.shiftId,
    shiftDate,
    shiftDateColumn,
    assigneeColumn,
    assigneeProfileId: assigneeId,
    shiftRow,
  });
  if (conflictError) {
    redirect(turniPathWithContext(month, day, undefined, conflictError));
  }
  const updatePayload: Record<string, unknown> = {};
  if ("status" in shiftRow) updatePayload.status = "approved";
  if ("approved_by" in shiftRow) updatePayload.approved_by = profile.id;
  if ("approved_at" in shiftRow) updatePayload.approved_at = new Date().toISOString();
  if (Object.keys(updatePayload).length === 0) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non aggiornato per approvazione."));
  }
  const { error: updateError } = await supabase.from("shifts").update(updatePayload).eq("id", parsed.data.shiftId);
  if (updateError) {
    redirect(turniPathWithContext(month, day, undefined, `Approvazione non riuscita: ${updateError.message}`));
  }
  revalidatePath("/turni");
  revalidatePath("/turni-ferie");
  redirect(turniPathWithContext(month, day, "approved"));
}

export async function rejectShiftAction(formData: FormData) {
  const parsed = shiftRejectSchema.safeParse({
    shiftId: formData.get("shiftId"),
    reason: formData.get("reason"),
    month: formData.get("month"),
    day: formData.get("day"),
  });
  const monthContext = getMonthContext(typeof formData.get("month") === "string" ? String(formData.get("month")) : undefined);
  const month = monthContext.yearMonth;
  const day = normalizeDayInMonth(typeof formData.get("day") === "string" ? String(formData.get("day")) : undefined, month);

  if (!parsed.success) {
    redirect(turniPathWithContext(month, day, undefined, "Dati rifiuto non validi."));
  }

  const profile = await requireUser();
  if (!canApproveShifts(profile)) {
    redirect("/forbidden");
  }

  const { supabase, shift, shiftError } = await loadShiftForUpdate(parsed.data.shiftId);
  if (shiftError || !shift) {
    redirect(turniPathWithContext(month, day, undefined, "Turno non trovato."));
  }
  const shiftRow = shift as Record<string, unknown>;
  if (normalizeShiftStatus(shiftRow.status) === "approved" && !("status" in shiftRow)) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non aggiornato per rifiuto."));
  }
  const updatePayload: Record<string, unknown> = {};
  if ("status" in shiftRow) updatePayload.status = "rejected";
  if ("rejected_by" in shiftRow) updatePayload.rejected_by = profile.id;
  if ("rejected_at" in shiftRow) updatePayload.rejected_at = new Date().toISOString();
  if ("rejection_reason" in shiftRow) updatePayload.rejection_reason = parsed.data.reason?.trim() || null;
  if (Object.keys(updatePayload).length === 0) {
    redirect(turniPathWithContext(month, day, undefined, "Schema turni non aggiornato per rifiuto."));
  }
  const { error: updateError } = await supabase.from("shifts").update(updatePayload).eq("id", parsed.data.shiftId);
  if (updateError) {
    redirect(turniPathWithContext(month, day, undefined, `Rifiuto proposta non riuscito: ${updateError.message}`));
  }

  revalidatePath("/turni");
  revalidatePath("/turni-ferie");
  redirect(turniPathWithContext(month, day, "rejected"));
}

export async function assignShiftAction(formData: FormData) {
  // Backward compatibility: old "Assegna" action now maps to proposal submit.
  return submitShiftProposalAction(formData);
}
