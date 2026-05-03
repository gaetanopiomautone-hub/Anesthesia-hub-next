"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, requireUser } from "@/lib/auth/get-current-user-profile";
import { ASSEGNAZIONE_SPECIALIZZANDO_VALUES } from "@/lib/domain/specializzando-assignment";
import type { AppRole } from "@/lib/auth/roles";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AdminUserMutationResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function parseOptionalInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Disattiva o riattiva (RLS admin). Redirect con messaggi in query param. */
export async function setUserActiveAdmin(formData: FormData) {
  await requireRole(["admin"]);
  const actor = await requireUser();

  const userId = String(formData.get("user_id") ?? "").trim();
  const nextRaw = String(formData.get("next_active") ?? "").trim().toLowerCase();
  const nextActive = nextRaw === "true" || nextRaw === "1";

  if (!userId) {
    redirect("/admin/users?e=" + encodeURIComponent("Utente non valido."));
  }

  if (userId === actor.id && !nextActive) {
    redirect("/admin/users?e=" + encodeURIComponent("Non puoi disattivare il tuo stesso account."));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("profiles").update({ is_active: nextActive }).eq("id", userId);

  if (error) {
    redirect("/admin/users?e=" + encodeURIComponent(error.message));
  }

  revalidatePath("/admin/users");
  redirect(`/admin/users?ok=${nextActive ? "reactivated" : "deactivated"}`);
}

export async function updateUserAdmin(formData: FormData): Promise<AdminUserMutationResult> {
  await requireRole(["admin"]);
  const actor = await requireUser();

  const userId = String(formData.get("user_id") ?? "").trim();
  const nome = String(formData.get("nome") ?? "").trim();
  const cognome = String(formData.get("cognome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const telefonoRaw = String(formData.get("telefono") ?? "").trim();
  const telefono = telefonoRaw === "" ? null : telefonoRaw;
  const roleRaw = String(formData.get("role") ?? "").trim();
  const isActiveRaw = String(formData.get("is_active") ?? "true").trim().toLowerCase();
  const isActive = !(isActiveRaw === "false" || isActiveRaw === "0");

  const annoSpecialitaParsed = parseOptionalInt(formData, "anno_specialita");
  const assegnazioneRaw = String(formData.get("assegnazione") ?? "").trim();

  if (!userId) {
    return { ok: false, error: "Utente non valido." };
  }

  let role: AppRole;
  if (roleRaw === "admin" || roleRaw === "tutor" || roleRaw === "specializzando") {
    role = roleRaw;
  } else {
    return { ok: false, error: "Seleziona un ruolo valido." };
  }

  let annoSpecialita: number | null = null;
  let assegnazioneDb: string | null = null;

  if (!nome || !cognome || !email) {
    return { ok: false, error: "Nome, cognome e email sono obbligatori." };
  }

  if (userId === actor.id && !isActive) {
    return { ok: false, error: "Non puoi disattivare il tuo stesso account da qui." };
  }

  if (role === "specializzando") {
    if (
      annoSpecialitaParsed === null ||
      annoSpecialitaParsed < 1 ||
      annoSpecialitaParsed > 5
    ) {
      return { ok: false, error: "Anno di specialità obbligatorio (tra 1 e 5)." };
    }
    if (!(ASSEGNAZIONE_SPECIALIZZANDO_VALUES as readonly string[]).includes(assegnazioneRaw)) {
      return { ok: false, error: "Assegnazione non valida." };
    }
    annoSpecialita = annoSpecialitaParsed;
    assegnazioneDb = assegnazioneRaw;
  } else {
    if (
      formData.has("anno_specialita") &&
      String(formData.get("anno_specialita") ?? "").trim() !== ""
    ) {
      return { ok: false, error: "Per admin/tutor non indicare anno di specialità." };
    }
    if (String(formData.get("assegnazione") ?? "").trim() !== "") {
      return { ok: false, error: "Per admin/tutor non indicare assegnazione." };
    }
  }

  let svc;
  try {
    svc = createServiceRoleSupabaseClient();
  } catch {
    return { ok: false, error: "Configurazione server incompleta (chiave service role)." };
  }

  const { data: currentProf, error: loadErr } = await svc.from("profiles").select("email").eq("id", userId).maybeSingle();

  if (loadErr || !currentProf) {
    return { ok: false, error: loadErr?.message ?? "Profilo non trovato." };
  }

  const currentEmail = String((currentProf as { email?: string }).email ?? "").trim().toLowerCase();

  if (email !== currentEmail) {
    const { error: authErr } = await svc.auth.admin.updateUserById(userId, { email });
    if (authErr) {
      return {
        ok: false,
        error: `Aggiornamento email su Auth fallito: ${authErr.message}`,
      };
    }
  }

  const { error: rpcErr } = await svc.rpc("admin_apply_profile_update", {
    p_user_id: userId,
    p_nome: nome,
    p_cognome: cognome,
    p_telefono: telefono ?? "",
    p_email: email,
    p_is_active: isActive,
    p_role: role,
    p_anno: role === "specializzando" ? annoSpecialita : null,
    p_asseg:
      role === "specializzando" && assegnazioneDb
        ? assegnazioneDb
        : null,
  });

  if (rpcErr) {
    return {
      ok: false,
      error: rpcErr.message || "Aggiornamento profilo fallito.",
    };
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}/edit`);
  return { ok: true, message: "Profilo aggiornato." };
}
