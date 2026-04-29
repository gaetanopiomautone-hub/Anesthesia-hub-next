import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SalaOperatoriaOption = {
  id: string;
  name: string;
};

/** Sale operative attive (anagrafica), da usare come opzioni per slot planning mensile. */
export async function listActiveSalaOperatoriaLocations(): Promise<SalaOperatoriaOption[]> {
  try {
    const supabase = await createServerSupabaseClient();
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
