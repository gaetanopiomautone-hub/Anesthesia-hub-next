import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SalaOperatoriaOption = {
  id: string;
  name: string;
  specialty: string | null;
};

/** Sale operative attive (anagrafica), da usare come opzioni per slot planning mensile. */
export async function listActiveSalaOperatoriaLocations(): Promise<SalaOperatoriaOption[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clinical_locations")
    .select("id,name,specialty")
    .eq("is_active", true)
    .eq("area_type", "sala_operatoria")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`clinical_locations query failed: ${error.message}`);
  }

  return (data ?? []).map((r) => ({
    id: String((r as { id: string }).id),
    name: String((r as { name: string }).name),
    specialty: (r as { specialty: string | null }).specialty ?? null,
  }));
}
