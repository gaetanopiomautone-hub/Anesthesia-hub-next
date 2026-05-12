"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TraineeLocationCompetencyStatus } from "@/lib/domain/trainee-competency-assignment-hint";

const STATUSES: TraineeLocationCompetencyStatus[] = [
  "abilitato",
  "preferenziale",
  "rotazione",
  "non_assegnabile",
];

export type TraineeCompetencyActionState = { ok: true } | { ok: false; error: string };

export async function addTraineeLocationCompetencyAction(
  _prev: TraineeCompetencyActionState | null,
  formData: FormData,
): Promise<TraineeCompetencyActionState> {
  await requireRole(["admin"]);
  const traineeId = String(formData.get("traineeId") ?? "").trim();
  const assignmentLocationId = String(formData.get("assignmentLocationId") ?? "").trim();
  const clinicalAreaId = String(formData.get("clinicalAreaId") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim() as TraineeLocationCompetencyStatus;
  const note = String(formData.get("note") ?? "").trim() || null;
  const startsOn = String(formData.get("startsOn") ?? "").trim() || null;
  const endsOn = String(formData.get("endsOn") ?? "").trim() || null;

  if (!traineeId) {
    return { ok: false, error: "Seleziona uno specializzando." };
  }
  if (!assignmentLocationId && !clinicalAreaId) {
    return { ok: false, error: "Indica almeno una sala (catalogo) o un’area tipo." };
  }
  if (!STATUSES.includes(status)) {
    return { ok: false, error: "Stato non valido." };
  }
  if (startsOn && endsOn && endsOn < startsOn) {
    return { ok: false, error: "La data fine deve essere ≥ data inizio." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("trainee_assignment_location_competencies").insert({
    trainee_id: traineeId,
    assignment_location_id: assignmentLocationId || null,
    clinical_area_id: clinicalAreaId || null,
    status,
    note,
    starts_on: startsOn,
    ends_on: endsOn,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/trainee-competencies");
  revalidatePath("/turni");
  return { ok: true };
}

export async function deleteTraineeLocationCompetencyAction(competencyId: string): Promise<TraineeCompetencyActionState> {
  await requireRole(["admin"]);
  const id = competencyId.trim();
  if (!id) {
    return { ok: false, error: "ID mancante." };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("trainee_assignment_location_competencies").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/admin/trainee-competencies");
  revalidatePath("/turni");
  return { ok: true };
}

/** `action` su `<form>` (firma a un solo argomento). */
export async function deleteTraineeLocationCompetencyFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("competencyId") ?? "").trim();
  await deleteTraineeLocationCompetencyAction(id);
}
