import type { AppRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type LearningResourceType = "pdf" | "link";

export type LearningResourceRow = {
  id: string;
  title: string;
  description: string | null;
  resource_type: LearningResourceType;
  file_url: string | null;
  external_url: string | null;
  visibility: AppRole[];
  created_at: string;
};

function normalizeVisibility(raw: unknown): AppRole[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((v): v is AppRole => typeof v === "string");
  }
  return [];
}

export function visibilitySummary(roles: AppRole[]) {
  if (roles.length === 0) return "Nessun ruolo";
  return roles.join(", ");
}

/** Visibilita' applicata da RLS su learning_resources. */
export async function listLearningResources(): Promise<LearningResourceRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("learning_resources")
    .select("id, title, description, resource_type, file_url, external_url, visibility, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`learning_resources list failed: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    ...row,
    resource_type: row.resource_type as LearningResourceType,
    visibility: normalizeVisibility(row.visibility),
  })) as LearningResourceRow[];
}
