"use server";

import { requireRole } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import type { AssegnazioneSpecializzando } from "@/lib/domain/specializzando-assignment";
import { ASSEGNAZIONE_SPECIALIZZANDO_VALUES } from "@/lib/domain/specializzando-assignment";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { siteUrlForAuthRedirect } from "@/lib/supabase/site-url";

export type CreateUserByAdminResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function parseOptionalInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Flusso A: invite email Supabase Auth; l’utente imposta password dal link (nessuna password sul form). */
export async function createUserByAdmin(formData: FormData): Promise<CreateUserByAdminResult> {
  await requireRole(["admin"]);

  const nome = String(formData.get("nome") ?? "").trim();
  const cognome = String(formData.get("cognome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const telefonoRaw = String(formData.get("telefono") ?? "").trim();
  const telefono = telefonoRaw || null;
  const roleRaw = String(formData.get("role") ?? "").trim();

  const annoSpecialitaParsed = parseOptionalInt(formData, "anno_specialita");
  const assegnazioneRaw = String(formData.get("assegnazione") ?? "").trim();

  if (!nome || !cognome) {
    return { ok: false, error: "Nome e cognome sono obbligatori." };
  }
  if (!email) {
    return { ok: false, error: "Email obbligatoria." };
  }

  let role: AppRole;
  if (roleRaw === "admin" || roleRaw === "tutor" || roleRaw === "specializzando") {
    role = roleRaw;
  } else {
    return { ok: false, error: "Seleziona un ruolo valido." };
  }

  let annoSpecialita: number | undefined;

  if (role === "specializzando") {
    if (
      annoSpecialitaParsed === null ||
      annoSpecialitaParsed < 1 ||
      annoSpecialitaParsed > 5
    ) {
      return { ok: false, error: "Anno di specialità obbligatorio (tra 1 e 5)." };
    }
    if (!(ASSEGNAZIONE_SPECIALIZZANDO_VALUES as readonly string[]).includes(assegnazioneRaw)) {
      return { ok: false, error: "Assegnazione obbligatoria e non valida." };
    }
    annoSpecialita = annoSpecialitaParsed;
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

  let supabase;
  try {
    supabase = createServiceRoleSupabaseClient();
  } catch {
    return { ok: false, error: "Configurazione server incompleta (chiave service role)." };
  }

  const meta: Record<string, string | number | undefined> = {
    nome,
    cognome,
    role,
  };
  if (telefono) meta.telefono = telefono;

  if (role === "specializzando" && annoSpecialita !== undefined) {
    meta.anno_specialita = annoSpecialita;
    meta.assegnazione = assegnazioneRaw as AssegnazioneSpecializzando;
  }

  const base = siteUrlForAuthRedirect();
  const inviteOptions: {
    data: Record<string, unknown>;
    redirectTo?: string;
  } = {
    data: meta as Record<string, unknown>,
  };
  if (base) {
    inviteOptions.redirectTo = `${base}/set-password`;
  }

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      return { ok: false, error: "Questa email è già registrata. Usa un altro indirizzo o reimposta l’accesso da Supabase Auth." };
    }
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    message: `Invito inviato a ${email}. L’utente riceverà il link per impostare la password.`,
  };
}
