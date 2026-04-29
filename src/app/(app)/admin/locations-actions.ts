"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import { requireRole } from "@/lib/auth/get-current-user-profile";
import { getSupabaseEnv } from "@/lib/supabase/env";

function createServiceRoleSupabaseClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable: SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceRoleKey);
}

export type CreateClinicalLocationResult = { ok: true } | { ok: false; error: string };

export async function createClinicalLocationAction(formData: FormData): Promise<CreateClinicalLocationResult> {
  await requireRole(["admin"]);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { ok: false, error: "Nome sala obbligatorio" };
  }

  const areaTypeRaw = String(formData.get("area_type") ?? "sala_operatoria").trim();
  const area_type = areaTypeRaw === "rianimazione" ? "rianimazione" : "sala_operatoria";

  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.from("clinical_locations").insert({
    name,
    area_type,
    is_active: true,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Create clinical location failed", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin");
  revalidatePath("/turni");
  revalidatePath("/dashboard");
  return { ok: true };
}
