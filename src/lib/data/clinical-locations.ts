import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/supabase/env";

export type SalaOperatoriaOption = {
  id: string;
  name: string;
};

function createServiceRoleSupabaseClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey);
}

/**
 * Sale operative attive per il form admin su `/turni`.
 * Usa **service role** (solo server) così l’elenco non dipende da RLS su `clinical_locations`.
 */
export async function listActiveSalaOperatoriaLocations(): Promise<SalaOperatoriaOption[]> {
  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data, error } = await supabase
      .from("clinical_locations")
      .select("id,name,area_type")
      .eq("is_active", true)
      .eq("area_type", "sala_operatoria")
      .order("name", { ascending: true });

    if (error) {
      // eslint-disable-next-line no-console
      console.error("clinical_locations query failed:", error.message);
      return [];
    }

    return (data ?? []).map((r) => ({
      id: String((r as { id: string }).id),
      name: String((r as { name: string }).name),
    }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("listActiveSalaOperatoriaLocations:", e);
    return [];
  }
}
