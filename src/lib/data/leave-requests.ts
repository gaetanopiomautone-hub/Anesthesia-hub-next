import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import type { LeaveRequestRow } from "@/lib/domain/leave-request-shared";
export type { LeaveRequestRow, LeaveRequestStatus, LeaveRequestType } from "@/lib/domain/leave-request-shared";
export { formatDateItalian, leaveStatusLabelItalian, leaveTypeLabelItalian } from "@/lib/domain/leave-request-shared";
import { mapLeaveRequestFromDb } from "@/lib/domain/leave-request-db";
import { formatYmd, isValidYearMonth, monthEndYmd, monthStartYmd } from "@/lib/dates/ymd";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { profileDisplayName } from "@/lib/utils/profile-display";

export const LEAVE_SELECT =
  "id, user_id, request_type, start_date, end_date, status, reason, reviewed_by, reviewed_at, cancelled_at, created_at";

export type ListLeaveRequestsScope = "calendar" | "all";

export type ListLeaveRequestsOptions = {
  /** `calendar` = filtro intersezione mese; `all` = lista principale senza mese. */
  scope?: ListLeaveRequestsScope;
  /** Solo con scope `calendar`: richieste che intersecano il mese (`yyyy-MM`). */
  yearMonth?: string;
  /**
   * Lista completa visibile al ruolo (senza filtro mese).
   * Equivalente a `scope: "all"`.
   */
  includeAllFuture?: boolean;
  /** @deprecated Usare `includeAllFuture` o `scope: "all"`. */
  allInView?: boolean;
  limit?: number;
};

function resolveListScope(options?: ListLeaveRequestsOptions): ListLeaveRequestsScope {
  if (options?.scope === "calendar" || options?.scope === "all") return options.scope;
  if (options?.includeAllFuture || options?.allInView) return "all";
  if (options?.yearMonth) return "calendar";
  return "all";
}

export async function listLeaveRequests(profile: CurrentUserProfile, options?: ListLeaveRequestsOptions) {
  const supabase = await createServerSupabaseClient();
  const scope = resolveListScope(options);
  const limit = options?.limit ?? (scope === "calendar" ? 50 : 100);

  let query = supabase.from("leave_requests").select(LEAVE_SELECT).order("created_at", { ascending: false }).limit(limit);

  if (profile.role === "specializzando") {
    query = query.eq("user_id", profile.id);
  }

  if (scope === "calendar" && options?.yearMonth && isValidYearMonth(options.yearMonth)) {
    query = query.lte("start_date", monthEndYmd(options.yearMonth)).gte("end_date", monthStartYmd(options.yearMonth));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []).map((row) => mapLeaveRequestFromDb(row as Record<string, unknown>));

  if (profile.role === "specializzando" || rows.length === 0) {
    return rows;
  }

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
  const { data: requesters, error: requestersError } = await supabase
    .from("profiles")
    .select("id, nome, cognome, email")
    .in("id", userIds);

  if (requestersError) {
    throw new Error(requestersError.message);
  }

  const requesterById = new Map(
    (requesters ?? []).map((p) => {
      const nome = String(p.nome ?? "").trim();
      const cognome = String(p.cognome ?? "").trim();
      const email = String(p.email ?? "").trim();
      return [
        String(p.id),
        {
          full_name: profileDisplayName({ nome, cognome, email }),
          email: email || null,
        },
      ] as const;
    }),
  );

  return rows.map((row) => ({
    ...row,
    requester: requesterById.get(row.user_id) ?? null,
  }));
}
