import type { AssegnazioneSpecializzando } from "@/lib/domain/specializzando-assignment";

export type TraineeAssignmentPeriodRow = {
  id: string;
  trainee_id: string;
  starts_on: string;
  ends_on: string;
  ambito: AssegnazioneSpecializzando;
  note: string | null;
};

/** Intervalli chiusi [starts_on, ends_on]. */
export function assignmentPeriodRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function findOverlappingAssignmentPeriod(
  periods: TraineeAssignmentPeriodRow[],
  params: {
    startsOn: string;
    endsOn: string;
    ambito: AssegnazioneSpecializzando;
    excludeId?: string;
  },
): TraineeAssignmentPeriodRow | null {
  const { startsOn, endsOn, ambito, excludeId } = params;
  for (const p of periods) {
    if (excludeId && p.id === excludeId) continue;
    if (p.ambito !== ambito) continue;
    if (assignmentPeriodRangesOverlap(startsOn, endsOn, p.starts_on, p.ends_on)) {
      return p;
    }
  }
  return null;
}

/** `reference` in formato YYYY-MM-DD (default: oggi locale). */
export function isAssignmentPeriodActive(
  period: Pick<TraineeAssignmentPeriodRow, "starts_on" | "ends_on">,
  reference?: string,
): boolean {
  const ref = reference ?? todayIsoDate();
  return period.starts_on <= ref && ref <= period.ends_on;
}

export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function activeAssignmentPeriodsOn(
  periods: TraineeAssignmentPeriodRow[],
  reference?: string,
): TraineeAssignmentPeriodRow[] {
  return periods.filter((p) => isAssignmentPeriodActive(p, reference));
}
