import { pickSpecializzandiProfilesEmbed } from "@/lib/domain/specializzandi-embed";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";

export const ASSIGNABLE_TRAINEE_VALIDATION_ERROR_IT =
  "L'utente selezionato non è uno specializzando attivo assegnabile.";

/** Valori stabili da cercare nei log aggregati (`assignable_trainee_rejected`). */
export type AssignableTraineeRejectedReason =
  | "profile_not_found"
  | "wrong_role"
  | "inactive"
  | "missing_specializzandi_profile"
  | "invalid_anno_specialita"
  | "missing_assegnazione"
  | "profile_query_failed";

function warnAssignableTraineeRejected(params: {
  userId: string;
  reason: AssignableTraineeRejectedReason;
  detail?: string;
}): void {
  const line = JSON.stringify({
    scope: "assignable_trainee_rejected",
    ...params,
  });
  console.warn(line);
}

function rejectAssignableTrainee(userId: string, reason: Exclude<AssignableTraineeRejectedReason, "profile_query_failed">): never {
  warnAssignableTraineeRejected({ userId, reason });
  throw new Error(ASSIGNABLE_TRAINEE_VALIDATION_ERROR_IT);
}

/**
 * Verifica che `userId` possa ricevere assegnazioni su `shift_items`.
 * Lettura profilo via **service role** (solo server): gli specializzandi non leggono altri `profiles` sotto RLS.
 * Chi chiama questo metodo deve aggiornare `shift_items` con il client di **sessione** (`createServerSupabaseClient`), così il write resta sotto policy.
 */
export async function assertUserIdIsAssignableTrainee(userId: string): Promise<void> {
  const svc = createServiceRoleSupabaseClient();
  const { data, error } = await svc
    .from("profiles")
    .select(
      `
      id,
      role,
      is_active,
      specializzandi_profiles (
        anno_specialita,
        assegnazione
      )
    `,
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    warnAssignableTraineeRejected({
      userId,
      reason: "profile_query_failed",
      detail: error.message,
    });
    throw new Error(error.message);
  }
  if (!data) {
    rejectAssignableTrainee(userId, "profile_not_found");
  }

  const row = data as { role?: string; is_active?: boolean; specializzandi_profiles?: unknown };

  if (row.role !== "specializzando") {
    rejectAssignableTrainee(userId, "wrong_role");
  }
  if (!row.is_active) {
    rejectAssignableTrainee(userId, "inactive");
  }

  const spez = pickSpecializzandiProfilesEmbed(row.specializzandi_profiles);
  if (!spez) {
    rejectAssignableTrainee(userId, "missing_specializzandi_profile");
  }
  if (!Number.isFinite(spez.anno_specialita) || spez.anno_specialita < 1 || spez.anno_specialita > 5) {
    rejectAssignableTrainee(userId, "invalid_anno_specialita");
  }
  if (!String(spez.assegnazione ?? "").trim()) {
    rejectAssignableTrainee(userId, "missing_assegnazione");
  }
}
