import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { compareYmd, parseYmd } from "@/lib/dates/ymd";
import { hasDateOverlap } from "@/lib/dates/hasDateOverlap";
import { LEAVE_REQUESTS_ACTIVE_OVERLAP_STATUSES } from "@/lib/domain/leave-requests-db-contract";

/** Stati che bloccano una nuova richiesta sovrapposta (esclusi annullato/rifiutato). */
export const ACTIVE_LEAVE_OVERLAP_DB_STATUSES = [...LEAVE_REQUESTS_ACTIVE_OVERLAP_STATUSES];

export const LEAVE_OVERLAP_ERROR_MESSAGE =
  "Hai già una richiesta ferie in questo periodo (anche parziale).";
export const LEAVE_OVERLAP_ERROR_CODE = "overlap" as const;

export type FindActiveLeaveOverlapParams = {
  userId: string;
  startDate: string;
  endDate: string;
  /** Esclude la richiesta in modifica (update). */
  excludeRequestId?: string;
};

export type FindActiveLeaveOverlapResult = {
  overlappingId: string | null;
  error: PostgrestError | null;
};

export class LeaveDateRangeError extends Error {
  readonly code = "invalid_date_range" as const;

  constructor(
    message = "La data di fine deve essere successiva o uguale alla data di inizio.",
  ) {
    super(message);
    this.name = "LeaveDateRangeError";
  }
}

/** Validazione canonica intervallo richiesta (timezone-safe). */
export function assertValidLeaveDateRange(startDate: string, endDate: string): void {
  parseYmd(startDate);
  parseYmd(endDate);
  if (compareYmd(startDate, endDate) > 0) {
    throw new LeaveDateRangeError();
  }
}

/** Predicato puro allineato alla query PostgREST (start <= otherEnd && end >= otherStart). */
export function activeLeaveRangesOverlap(
  candidateStart: string,
  candidateEnd: string,
  existingStart: string,
  existingEnd: string,
): boolean {
  return hasDateOverlap(candidateStart, candidateEnd, existingStart, existingEnd);
}

/**
 * Unico punto di verità server-side per overlap ferie attive.
 * Considera solo `in_attesa` e `approvato` per il richiedente.
 */
export async function findOverlappingActiveLeaveRequest(
  supabase: SupabaseClient,
  params: FindActiveLeaveOverlapParams,
): Promise<FindActiveLeaveOverlapResult> {
  assertValidLeaveDateRange(params.startDate, params.endDate);

  let query = supabase
    .from("leave_requests")
    .select("id")
    .eq("user_id", params.userId)
    .in("status", ACTIVE_LEAVE_OVERLAP_DB_STATUSES)
    .lte("start_date", params.endDate)
    .gte("end_date", params.startDate)
    .limit(1);

  if (params.excludeRequestId) {
    query = query.neq("id", params.excludeRequestId);
  }

  const { data, error } = await query;

  if (error) {
    return { overlappingId: null, error };
  }

  const overlappingId = data?.[0]?.id != null ? String(data[0].id) : null;
  return { overlappingId, error: null };
}

export function hasActiveLeaveOverlap(result: FindActiveLeaveOverlapResult): boolean {
  return result.overlappingId != null;
}
