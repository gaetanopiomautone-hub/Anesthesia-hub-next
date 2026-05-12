"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import { parseProfileGender } from "@/lib/domain/profile-greeting";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type UpdateOwnProfileResult = { ok: true } | { ok: false; error: string };

export async function updateOwnProfileAction(_prev: UpdateOwnProfileResult | null, formData: FormData): Promise<UpdateOwnProfileResult> {
  const user = await requireUser();
  const nome = String(formData.get("nome") ?? "").trim();
  const cognome = String(formData.get("cognome") ?? "").trim();
  const telefonoRaw = String(formData.get("telefono") ?? "").trim();
  const telefono = telefonoRaw === "" ? null : telefonoRaw;
  const genderRaw = String(formData.get("gender") ?? "").trim();
  const gender = genderRaw === "" ? null : parseProfileGender(genderRaw);

  if (genderRaw !== "" && gender === null) {
    return { ok: false, error: "Preferenza saluto non valida." };
  }
  if (!nome || !cognome) {
    return { ok: false, error: "Nome e cognome sono obbligatori." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("profiles").update({ nome, cognome, telefono, gender }).eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message || "Salvataggio non riuscito." };
  }

  revalidatePath("/profilo");
  revalidatePath("/dashboard");
  return { ok: true };
}
