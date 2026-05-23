"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/get-current-user-profile";
import { findOverlappingAssignmentPeriod } from "@/lib/domain/trainee-assignment-period";
import { listTraineeAssignmentPeriodsForUser } from "@/lib/data/trainee-assignment-periods";
import { syncProfileAssegnazioneFromActivePeriod } from "@/lib/data/trainee-assignment-period-sync";
import {
  ASSEGNAZIONE_SPECIALIZZANDO_VALUES,
  parseAssegnazioneFromForm,
  type AssegnazioneSpecializzando,
} from "@/lib/domain/specializzando-assignment";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TraineeAssignmentPeriodActionState = { ok: true } | { ok: false; error: string };

function editPath(userId: string) {
  return `/admin/users/${userId}/edit`;
}

function parseRequiredDate(raw: string, label: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return { ok: false, error: `${label} non valida (formato AAAA-MM-GG).` };
  }
  return { ok: true, value: v };
}

async function assertNoOverlapSameAmbito(params: {
  traineeId: string;
  startsOn: string;
  endsOn: string;
  ambito: AssegnazioneSpecializzando;
  excludeId?: string;
}): Promise<TraineeAssignmentPeriodActionState | null> {
  const existing = await listTraineeAssignmentPeriodsForUser(params.traineeId);
  const overlap = findOverlappingAssignmentPeriod(existing, {
    startsOn: params.startsOn,
    endsOn: params.endsOn,
    ambito: params.ambito,
    excludeId: params.excludeId,
  });
  if (overlap) {
    return {
      ok: false,
      error: `Esiste già un periodo nello stesso ambito che si sovrappone (${overlap.starts_on} → ${overlap.ends_on}).`,
    };
  }
  return null;
}

async function syncProfileAssegnazioneForTrainee(traineeId: string): Promise<void> {
  const periods = await listTraineeAssignmentPeriodsForUser(traineeId);
  const supabase = await createServerSupabaseClient();
  await syncProfileAssegnazioneFromActivePeriod({
    traineeId,
    periods,
    updateAssegnazione: async (ambito) => {
      await supabase.from("specializzandi_profiles").update({ assegnazione: ambito }).eq("user_id", traineeId);
    },
  });
}

function overlapDbMessage(message: string): string {
  if (/trainee_assignment_periods_no_overlap_same_ambito|exclusion|sovrapp/i.test(message)) {
    return "Periodo non valido: sovrapposizione con un altro record nello stesso ambito.";
  }
  return message;
}

export async function addTraineeAssignmentPeriodAction(
  _prev: TraineeAssignmentPeriodActionState | null,
  formData: FormData,
): Promise<TraineeAssignmentPeriodActionState> {
  await requireRole(["admin"]);

  const traineeId = String(formData.get("traineeId") ?? "").trim();
  const startsParsed = parseRequiredDate(String(formData.get("startsOn") ?? ""), "Data inizio");
  const endsParsed = parseRequiredDate(String(formData.get("endsOn") ?? ""), "Data fine");
  const ambitoRaw = String(formData.get("ambito") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!traineeId) {
    return { ok: false, error: "Utente non valido." };
  }
  if (!startsParsed.ok) return startsParsed;
  if (!endsParsed.ok) return endsParsed;
  if (endsParsed.value < startsParsed.value) {
    return { ok: false, error: "La data fine deve essere ≥ data inizio." };
  }

  const ambito = parseAssegnazioneFromForm(ambitoRaw);
  if (!ambito || !(ASSEGNAZIONE_SPECIALIZZANDO_VALUES as readonly string[]).includes(ambito)) {
    return { ok: false, error: "Ambito non valido." };
  }

  const overlapErr = await assertNoOverlapSameAmbito({
    traineeId,
    startsOn: startsParsed.value,
    endsOn: endsParsed.value,
    ambito,
  });
  if (overlapErr) return overlapErr;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("trainee_assignment_periods").insert({
    trainee_id: traineeId,
    starts_on: startsParsed.value,
    ends_on: endsParsed.value,
    ambito,
    note,
  });

  if (error) {
    return { ok: false, error: overlapDbMessage(error.message) };
  }

  await syncProfileAssegnazioneForTrainee(traineeId);
  revalidatePath(editPath(traineeId));
  revalidatePath("/admin/users");
  revalidatePath("/turni");
  return { ok: true };
}

export async function updateTraineeAssignmentPeriodAction(
  _prev: TraineeAssignmentPeriodActionState | null,
  formData: FormData,
): Promise<TraineeAssignmentPeriodActionState> {
  await requireRole(["admin"]);

  const periodId = String(formData.get("periodId") ?? "").trim();
  const traineeId = String(formData.get("traineeId") ?? "").trim();
  const startsParsed = parseRequiredDate(String(formData.get("startsOn") ?? ""), "Data inizio");
  const endsParsed = parseRequiredDate(String(formData.get("endsOn") ?? ""), "Data fine");
  const ambitoRaw = String(formData.get("ambito") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!periodId || !traineeId) {
    return { ok: false, error: "Record non valido." };
  }
  if (!startsParsed.ok) return startsParsed;
  if (!endsParsed.ok) return endsParsed;
  if (endsParsed.value < startsParsed.value) {
    return { ok: false, error: "La data fine deve essere ≥ data inizio." };
  }

  const ambito = parseAssegnazioneFromForm(ambitoRaw);
  if (!ambito) {
    return { ok: false, error: "Ambito non valido." };
  }

  const overlapErr = await assertNoOverlapSameAmbito({
    traineeId,
    startsOn: startsParsed.value,
    endsOn: endsParsed.value,
    ambito,
    excludeId: periodId,
  });
  if (overlapErr) return overlapErr;

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("trainee_assignment_periods")
    .update({
      starts_on: startsParsed.value,
      ends_on: endsParsed.value,
      ambito,
      note,
    })
    .eq("id", periodId)
    .eq("trainee_id", traineeId);

  if (error) {
    return { ok: false, error: overlapDbMessage(error.message) };
  }

  await syncProfileAssegnazioneForTrainee(traineeId);
  revalidatePath(editPath(traineeId));
  revalidatePath("/admin/users");
  revalidatePath("/turni");
  return { ok: true };
}

export async function deleteTraineeAssignmentPeriodAction(
  periodId: string,
  traineeId: string,
): Promise<TraineeAssignmentPeriodActionState> {
  await requireRole(["admin"]);

  const id = periodId.trim();
  const uid = traineeId.trim();
  if (!id || !uid) {
    return { ok: false, error: "Record non valido." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("trainee_assignment_periods")
    .delete()
    .eq("id", id)
    .eq("trainee_id", uid);

  if (error) {
    return { ok: false, error: error.message };
  }

  await syncProfileAssegnazioneForTrainee(uid);
  revalidatePath(editPath(uid));
  revalidatePath("/admin/users");
  revalidatePath("/turni");
  return { ok: true };
}

export async function deleteTraineeAssignmentPeriodFormAction(formData: FormData): Promise<void> {
  const periodId = String(formData.get("periodId") ?? "").trim();
  const traineeId = String(formData.get("traineeId") ?? "").trim();
  await deleteTraineeAssignmentPeriodAction(periodId, traineeId);
}
