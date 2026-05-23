import type { TraineeAssignmentPeriodRow } from "@/lib/domain/trainee-assignment-period";
import { activeAssignmentPeriodsOn } from "@/lib/domain/trainee-assignment-period";
import type { AssegnazioneSpecializzando } from "@/lib/domain/specializzando-assignment";

/** Ambito da scrivere su `specializzandi_profiles.assegnazione`, o `null` se non allineare. */
export function resolveProfileAssegnazioneFromPeriods(
  periods: TraineeAssignmentPeriodRow[],
  reference?: string,
): AssegnazioneSpecializzando | null {
  const active = activeAssignmentPeriodsOn(periods, reference);
  if (active.length !== 1) return null;
  return active[0]!.ambito;
}

export async function syncProfileAssegnazioneFromActivePeriod(params: {
  traineeId: string;
  periods: TraineeAssignmentPeriodRow[];
  updateAssegnazione: (ambito: AssegnazioneSpecializzando) => Promise<void>;
  reference?: string;
}): Promise<void> {
  const ambito = resolveProfileAssegnazioneFromPeriods(params.periods, params.reference);
  if (!ambito) return;
  await params.updateAssegnazione(ambito);
}
