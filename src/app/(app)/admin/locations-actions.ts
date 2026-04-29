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

export type CreateClinicalLocationResult =
  | { ok: true; data: { id: string; name: string; area_type: "sala_operatoria" | "rianimazione"; is_active: boolean } }
  | { ok: false; error: string };

export async function createClinicalLocationAction(formData: FormData): Promise<CreateClinicalLocationResult> {
  await requireRole(["admin"]);

  const name = String(formData.get("name") ?? "").trim();
  const areaTypeRaw = String(formData.get("area_type") ?? "sala_operatoria").trim();
  const area_type = areaTypeRaw === "rianimazione" ? "rianimazione" : "sala_operatoria";
  const code = String(formData.get("code") ?? "").trim();
  // eslint-disable-next-line no-console
  console.log("createClinicalLocationAction payload", { name, areaType: area_type, code });

  if (!name) {
    return { ok: false, error: "Nome sala obbligatorio" };
  }

  const supabase = createServiceRoleSupabaseClient();
  const insertPayload: {
    name: string;
    area_type: "sala_operatoria" | "rianimazione";
    is_active: boolean;
    code?: string;
  } = {
    name,
    area_type,
    is_active: true,
  };
  if (code) {
    insertPayload.code = code;
  }
  const { data, error } = await supabase
    .from("clinical_locations")
    .insert(insertPayload)
    .select("id, name, area_type, is_active")
    .single();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("Create clinical location failed", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return { ok: false, error: `${error.message}${error.details ? ` — ${error.details}` : ""}` };
  }

  // eslint-disable-next-line no-console
  console.log("Clinical location created", data);
  revalidatePath("/admin/locations");
  revalidatePath("/admin");
  revalidatePath("/turni");
  revalidatePath("/dashboard");
  return {
    ok: true,
    data: {
      id: String((data as { id: string }).id),
      name: String((data as { name: string }).name),
      area_type: ((data as { area_type: "sala_operatoria" | "rianimazione" }).area_type ?? "sala_operatoria"),
      is_active: Boolean((data as { is_active: boolean }).is_active),
    },
  };
}
