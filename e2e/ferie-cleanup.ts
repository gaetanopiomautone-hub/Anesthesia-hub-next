import { createClient } from "@supabase/supabase-js";

import { FERIE_E2E_END, FERIE_E2E_START } from "./ferie-helpers";

/**
 * Rimuove richieste ferie dello specializzando E2E che intersecano la finestra E2E
 * (default 2026-07-15). Richiede service role (bypass RLS).
 */
export async function cleanupFerieE2eLeaves(params?: { startYmd?: string; endYmd?: string }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = process.env.E2E_SPECIALIZZANDO_EMAIL?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error("cleanupFerieE2eLeaves: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono obbligatori.");
  }
  if (!email) {
    throw new Error("cleanupFerieE2eLeaves: E2E_SPECIALIZZANDO_EMAIL mancante.");
  }

  const startYmd = params?.startYmd ?? FERIE_E2E_START;
  const endYmd = params?.endYmd ?? FERIE_E2E_END;

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    throw new Error(`cleanupFerieE2eLeaves: lookup profilo fallito: ${profileError.message}`);
  }
  if (!profile?.id) {
    return { deleted: 0, profileId: null as string | null };
  }

  const { data: deletedRows, error: deleteError } = await supabase
    .from("leave_requests")
    .delete()
    .eq("user_id", profile.id)
    .lte("start_date", endYmd)
    .gte("end_date", startYmd)
    .select("id");

  if (deleteError) {
    throw new Error(`cleanupFerieE2eLeaves: delete fallito: ${deleteError.message}`);
  }

  return { deleted: deletedRows?.length ?? 0, profileId: profile.id as string };
}
