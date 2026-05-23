import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

function hasSchemaGuardEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function createGuardClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

describe("logbook schema guard (remote DB)", () => {
  it.skipIf(!hasSchemaGuardEnv())("migration: colonne gerarchia catalogo e participation_role", async () => {
    const supabase = createGuardClient();

    const { error: catalogError } = await supabase
      .from("procedure_catalog")
      .select("id,category,procedure_name,subtype,name,active")
      .limit(0);
    expect(catalogError).toBeNull();

    const { error: entryError } = await supabase
      .from("logbook_entries")
      .select("id,quantity,participation_role")
      .limit(0);
    expect(entryError).toBeNull();
  });

  it.skipIf(!hasSchemaGuardEnv())(
    "catalogo: voce Sciatico — Popliteo attiva",
    async () => {
      const supabase = createGuardClient();
      const { data, error } = await supabase
        .from("procedure_catalog")
        .select("id")
        .eq("category", "Blocchi perinervosi")
        .eq("procedure_name", "Sciatico")
        .eq("subtype", "Popliteo")
        .eq("active", true)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
    },
  );
});
