import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssignmentLocationRow } from "@/lib/domain/assignment-locations";

function mapRow(raw: Record<string, unknown>): AssignmentLocationRow {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    kind: (raw.kind as AssignmentLocationRow["kind"]) ?? "sala",
    is_active: Boolean(raw.is_active ?? true),
    sort_order: Number(raw.sort_order ?? 0),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

/** Sale e attività attive (catalogo completo, es. admin futuro). */
export async function listAssignmentLocationsActive(): Promise<AssignmentLocationRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assignment_locations")
    .select("id,name,kind,is_active,sort_order,created_at,updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`assignment_locations query failed: ${error.message}`);
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/**
 * Solo voci assistenziali per slot **sala** nel planning mensile.
 * Tipi didattica / ferie / congresso restano in catalogo per i prossimi blocchi, non in questa select.
 */
export async function listAssignmentLocationsForSalaPlanning(): Promise<AssignmentLocationRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assignment_locations")
    .select("id,name,kind,is_active,sort_order,created_at,updated_at")
    .eq("is_active", true)
    .in("kind", ["sala", "ambulatorio"])
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`assignment_locations (sala planning) query failed: ${error.message}`);
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}
