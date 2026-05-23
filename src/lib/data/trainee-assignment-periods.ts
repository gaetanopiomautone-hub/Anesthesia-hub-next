import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssegnazioneSpecializzando } from "@/lib/domain/specializzando-assignment";
import type { TraineeAssignmentPeriodRow } from "@/lib/domain/trainee-assignment-period";

function mapRow(raw: Record<string, unknown>): TraineeAssignmentPeriodRow {
  return {
    id: String(raw.id ?? ""),
    trainee_id: String(raw.trainee_id ?? ""),
    starts_on: String(raw.starts_on ?? "").slice(0, 10),
    ends_on: String(raw.ends_on ?? "").slice(0, 10),
    ambito: String(raw.ambito ?? "") as AssegnazioneSpecializzando,
    note: raw.note != null && String(raw.note).trim() ? String(raw.note) : null,
  };
}

export async function listTraineeAssignmentPeriodsForUser(
  traineeId: string,
): Promise<TraineeAssignmentPeriodRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("trainee_assignment_periods")
    .select("id,trainee_id,starts_on,ends_on,ambito,note")
    .eq("trainee_id", traineeId)
    .order("starts_on", { ascending: false });

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    throw new Error(`trainee_assignment_periods: ${error.message}`);
  }

  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}
