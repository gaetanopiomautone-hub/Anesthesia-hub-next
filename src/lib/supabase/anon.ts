import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Client con chiave anon/public (mai service role).
 * GoTrue invia recovery/reset in modo affidabile su questo percorso; con service role può rispondere 500.
 */
export function createAnonSupabaseClient() {
  const { url, anonKey } = getSupabaseEnv();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
