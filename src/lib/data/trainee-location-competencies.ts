import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TraineeLocationCompetencyInput, TraineeLocationCompetencyStatus } from "@/lib/domain/trainee-competency-assignment-hint";
import { competencyOverlapsMonth } from "@/lib/domain/trainee-competency-assignment-hint";

function mapRow(raw: Record<string, unknown>): TraineeLocationCompetencyInput {
  return {
    id: String(raw.id ?? ""),
    trainee_id: String(raw.trainee_id ?? ""),
    assignment_location_id: raw.assignment_location_id ? String(raw.assignment_location_id) : null,
    clinical_area_id: raw.clinical_area_id ? String(raw.clinical_area_id) : null,
    status: String(raw.status ?? "abilitato") as TraineeLocationCompetencyStatus,
    note: raw.note != null ? String(raw.note) : null,
    starts_on: raw.starts_on != null ? String(raw.starts_on).slice(0, 10) : null,
    ends_on: raw.ends_on != null ? String(raw.ends_on).slice(0, 10) : null,
  };
}

/**
 * Tutte le competenze che intersecano [monthStart, monthEnd] (caricamento leggero per planning).
 */
export async function listTraineeLocationCompetenciesOverlappingMonth(params: {
  monthStart: string;
  monthEnd: string;
}): Promise<TraineeLocationCompetencyInput[]> {
  const supabase = await createServerSupabaseClient();
  const { monthStart, monthEnd } = params;

  const { data, error } = await supabase
    .from("trainee_assignment_location_competencies")
    .select("id,trainee_id,assignment_location_id,clinical_area_id,status,note,starts_on,ends_on")
    .order("trainee_id", { ascending: true })
    .order("starts_on", { ascending: true });

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    throw new Error(`trainee_assignment_location_competencies: ${error.message}`);
  }

  const rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
  return rows.filter((r) => competencyOverlapsMonth(r, monthStart, monthEnd));
}

/** Elenco completo per pagina admin (nessun filtro mese). */
export async function listTraineeLocationCompetenciesAll(): Promise<TraineeLocationCompetencyInput[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("trainee_assignment_location_competencies")
    .select("id,trainee_id,assignment_location_id,clinical_area_id,status,note,starts_on,ends_on")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`trainee_assignment_location_competencies: ${error.message}`);
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}
