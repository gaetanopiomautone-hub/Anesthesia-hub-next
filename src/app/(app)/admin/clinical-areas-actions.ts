"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CODE_REGEX = /^[a-z][a-z0-9_]*$/;

export type MutateClinicalAreaResult = { ok: true } | { ok: false; error: string };

function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

export async function createClinicalAreaAction(formData: FormData): Promise<MutateClinicalAreaResult> {
  await requireRole(["admin"]);

  const codeRaw = normalizeCode(String(formData.get("code") ?? ""));
  const name = String(formData.get("name") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const sortOrderRaw = String(formData.get("sort_order") ?? "0").trim();
  const sort_order = Number(sortOrderRaw);

  if (!CODE_REGEX.test(codeRaw)) {
    return {
      ok: false,
      error: "Codice: solo lettere minuscole, numeri e underscore (es. sala_base). Deve iniziare con una lettera.",
    };
  }
  if (!name) {
    return { ok: false, error: "Nome obbligatorio." };
  }
  if (!Number.isFinite(sort_order)) {
    return { ok: false, error: "Ordine non valido." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("clinical_areas").insert({
    code: codeRaw,
    name,
    description: descriptionRaw ? descriptionRaw : null,
    sort_order,
    is_active: true,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Esiste già un’area con questo codice." };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/clinical-areas");
  revalidatePath("/turni");
  return { ok: true };
}

export async function updateClinicalAreaAction(formData: FormData): Promise<MutateClinicalAreaResult> {
  await requireRole(["admin"]);

  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const sortOrderRaw = String(formData.get("sort_order") ?? "0").trim();
  const isActiveRaw = String(formData.get("is_active") ?? "true");

  const sort_order = Number(sortOrderRaw);
  const is_active = isActiveRaw === "true";

  if (!id) return { ok: false, error: "ID mancante." };
  if (!name) return { ok: false, error: "Nome obbligatorio." };
  if (!Number.isFinite(sort_order)) {
    return { ok: false, error: "Ordine non valido." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("clinical_areas")
    .update({
      name,
      description: descriptionRaw ? descriptionRaw : null,
      sort_order,
      is_active,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/clinical-areas");
  revalidatePath("/turni");
  return { ok: true };
}
