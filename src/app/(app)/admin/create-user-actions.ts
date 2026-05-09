"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import {
  parseAssegnazioneFromForm,
  type AssegnazioneSpecializzando,
} from "@/lib/domain/specializzando-assignment";
import { describeSupabaseAuthEmailError } from "@/lib/supabase/auth-email-errors";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role";
import { siteUrlForAuthRedirect } from "@/lib/supabase/site-url";

export type CreateUserByAdminResult =
  | { ok: true; message: string; recoveryEmailFailed?: boolean }
  | { ok: false; error: string };

function parseOptionalInt(formData: FormData, key: string): number | null {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Messaggio completo per errori Auth Admin API (spesso includono code/status oltre a message). */
function formatAuthAdminErr(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const o = err as Record<string, unknown>;
    const bits: string[] = [String(o.message)];
    for (const k of ["code", "status", "details", "hint"] as const) {
      const v = o[k];
      if (v !== undefined && v !== null && String(v).length > 0) {
        bits.push(`${k}=${String(v)}`);
      }
    }
    return bits.join(" | ");
  }
  return String(err);
}

/**
 * Tutti stringhe: `public.handle_new_user` usa solo `meta ->> 'chiave'` su raw_user_meta_data.
 * Evita ambiguità tra numeri JSON e testo lato Auth.
 */
function buildAuthUserMetadata(params: {
  nome: string;
  cognome: string;
  role: AppRole;
  telefono: string | null;
  annoSpecialita?: number;
  assegnazioneEnum?: AssegnazioneSpecializzando;
}): Record<string, string> {
  const out: Record<string, string> = {
    nome: params.nome,
    cognome: params.cognome,
    role: params.role,
  };
  if (params.telefono) out.telefono = params.telefono;
  if (
    params.role === "specializzando" &&
    params.annoSpecialita !== undefined &&
    params.assegnazioneEnum
  ) {
    out.anno_specialita = String(params.annoSpecialita);
    out.assegnazione = params.assegnazioneEnum;
  }
  return out;
}

/**
 * Su alcuni progetti i metadati completi non sono disponibili nel trigger AFTER INSERT.
 * Creiamo prima l'utente come tutor (nome/cognome ok, senza anno/assegnazione); poi
 * updateUserById con il ruolo reale attiva il trigger su UPDATE.
 */
function buildBootstrapAuthUserMetadata(params: {
  nome: string;
  cognome: string;
  telefono: string | null;
}): Record<string, string> {
  const out: Record<string, string> = {
    nome: params.nome,
    cognome: params.cognome,
    role: "tutor",
  };
  if (params.telefono) out.telefono = params.telefono;
  return out;
}

/**
 * Crea utente (admin) + allinea profili via RPC + tenta recovery email (imposta password).
 * Se l’invio email fallisce (Auth/SMTP), l’utente resta comunque creato e il messaggio lo segnala.
 */
export async function createUserByAdmin(formData: FormData): Promise<CreateUserByAdminResult> {
  try {
    await requireRole(["admin"]);
    return await runCreateUserByAdmin(formData);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Errore server: ${msg}` };
  }
}

async function runCreateUserByAdmin(formData: FormData): Promise<CreateUserByAdminResult> {
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
  let assegnazioneEnum: AssegnazioneSpecializzando | undefined;

  if (role === "specializzando") {
    if (
      annoSpecialitaParsed === null ||
      annoSpecialitaParsed < 1 ||
      annoSpecialitaParsed > 5
    ) {
      return { ok: false, error: "Anno di specialità obbligatorio (tra 1 e 5)." };
    }
    const parsedAsseg = parseAssegnazioneFromForm(assegnazioneRaw);
    if (!parsedAsseg) {
      return {
        ok: false,
        error:
          "Assegnazione non valida: usa un valore dall’elenco (il database accetta enum tipo sala_base, sala_locoregionale, …).",
      };
    }
    annoSpecialita = annoSpecialitaParsed;
    assegnazioneEnum = parsedAsseg;
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

  const createUserMetadata =
    role === "specializzando"
      ? buildBootstrapAuthUserMetadata({ nome, cognome, telefono })
      : buildAuthUserMetadata({
          nome,
          cognome,
          role,
          telefono,
          annoSpecialita,
          assegnazioneEnum,
        });

  const finalUserMetadata = buildAuthUserMetadata({
    nome,
    cognome,
    role,
    telefono,
    annoSpecialita,
    assegnazioneEnum,
  });

  const base = siteUrlForAuthRedirect();
  if (!base) {
    return {
      ok: false,
      error:
        "NEXT_PUBLIC_SITE_URL non configurato nell’ambiente di deploy: senza questo valore gli inviti usano solo il Site URL del progetto Supabase (spesso solo la homepage) senza passare da /set-password. Imposta l’URL pubblico dell’app (es. https://…hosted.app) e includi nei Redirect URLs sia la root sia …/set-password.",
    };
  }

  const redirectToSetPassword = `${base}/set-password`;

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: createUserMetadata,
  });

  if (createErr) {
    const triggerHint =
      " Se persiste: controlla log Postgres (trigger public.handle_new_user su auth.users), vincolo UNIQUE su public.profiles.email, enum assegnazione e anno 1–5 per specializzando.";
    const msg = createErr.message.toLowerCase();
    if (
      msg.includes("already registered") ||
      msg.includes("already been registered") ||
      msg.includes("user already registered") ||
      msg.includes("duplicate")
    ) {
      return {
        ok: false,
        error:
          `[createUser] ${formatAuthAdminErr(createErr)} — ` +
          "Questa email è già registrata. Usa un altro indirizzo o reimposta l’accesso da Supabase Auth.",
      };
    }
    return {
      ok: false,
      error:
        `[createUser] ${formatAuthAdminErr(createErr)} — ${describeSupabaseAuthEmailError(createErr.message)}` +
        triggerHint,
    };
  }

  const userId = created?.user?.id ?? null;
  if (!userId) {
    return {
      ok: false,
      error: "[createUser] Nessun user.id nella risposta: impossibile completare la registrazione.",
    };
  }

  if (role === "specializzando") {
    console.error("[createUserByAdmin] updateUserById metadata", {
      email,
      userId,
      finalUserMetadata,
    });

    const { error: syncErr } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: finalUserMetadata,
    });
    if (syncErr) {
      await supabase.auth.admin.deleteUser(userId);
      return {
        ok: false,
        error: `[updateUserById] sync metadata specializzando: ${formatAuthAdminErr(syncErr)}`,
      };
    }
  }

  {
    const { data: updatedUserRes, error: readMetaErr } = await supabase.auth.admin.getUserById(userId);
    if (readMetaErr) {
      await supabase.auth.admin.deleteUser(userId);
      return {
        ok: false,
        error: `[getUserById] verifica metadata fallita: ${formatAuthAdminErr(readMetaErr)}`,
      };
    }

    const savedMeta = (updatedUserRes?.user?.user_metadata ?? {}) as Record<string, unknown>;
    if (!savedMeta.role || !savedMeta.nome || !savedMeta.cognome) {
      await supabase.auth.admin.deleteUser(userId);
      return {
        ok: false,
        error:
          `[user_metadata] mancano role/nome/cognome per userId=${userId}. Letto: ${JSON.stringify(savedMeta)}.`,
      };
    }
  }

  {
    const { error: rpcErr } = await supabase.rpc("admin_apply_profile_update", {
      p_user_id: userId,
      p_nome: nome,
      p_cognome: cognome,
      p_telefono: telefono ?? "",
      p_email: email,
      p_is_active: true,
      p_role: role,
      p_anno: role === "specializzando" && annoSpecialita !== undefined ? annoSpecialita : null,
      p_asseg: role === "specializzando" && assegnazioneEnum ? assegnazioneEnum : null,
    });

    if (rpcErr) {
      const baseMsg =
        `[RPC ERROR] ${rpcErr.message} | details=${rpcErr.details ?? "n/a"} | ` +
        `hint=${rpcErr.hint ?? "n/a"} | code=${rpcErr.code ?? "n/a"}`;

      await supabase.auth.admin.deleteUser(userId);

      return {
        ok: false,
        error: `${baseMsg} Creazione annullata: account Auth rimosso dopo errore RPC.`,
      };
    }
  }

  const { error: recoveryErr } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectToSetPassword,
  });

  revalidatePath("/admin/users");

  if (recoveryErr) {
    const rawMsg =
      recoveryErr && typeof recoveryErr === "object" && "message" in recoveryErr
        ? String((recoveryErr as { message: unknown }).message)
        : "";
    const friendly = describeSupabaseAuthEmailError(rawMsg);
    const technical = formatAuthAdminErr(recoveryErr);
    const detail =
      friendly !== rawMsg.trim() ? `${technical} — ${friendly}` : technical;

    return {
      ok: true,
      recoveryEmailFailed: true,
      message:
        `Utente creato e profilo sincronizzato. Invio email password fallito: ${detail}`,
    };
  }

  return {
    ok: true,
    message: `Utente creato. Abbiamo inviato a ${email} il link per impostare la password (controlla anche spam).`,
  };
}
