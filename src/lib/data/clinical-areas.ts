import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ClinicalAreaRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function mapRow(raw: Record<string, unknown>): ClinicalAreaRow {
  return {
    id: String(raw.id ?? ""),
    code: String(raw.code ?? ""),
    name: String(raw.name ?? ""),
    description: raw.description != null ? String(raw.description) : null,
    is_active: Boolean(raw.is_active ?? true),
    sort_order: Number(raw.sort_order ?? 0),
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

/** Elenco completo per admin (`/admin/clinical-areas`): include anche aree disattivate. */
export async function listClinicalAreasAll(): Promise<ClinicalAreaRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clinical_areas")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw new Error(`clinical_areas list: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

/** Turni/import nuovi: solo aree attive. */
export async function listClinicalAreasActive(): Promise<ClinicalAreaRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clinical_areas")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error) throw new Error(`clinical_areas active: ${error.message}`);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}
