"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import {
  ASSEGNAZIONE_SPECIALIZZANDO_VALUES,
  parseAssegnazioneFromForm,
  type AssegnazioneSpecializzando,
} from "@/lib/domain/specializzando-assignment";
import { describeSupabaseAuthEmailError } from "@/lib/supabase/auth-email-errors";
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
 * Debug: con `DEBUG_SKIP_INVITE_ROLLBACK_ON_RPC_FAIL=1` (o `true`) sul server non viene chiamato
 * `auth.admin.deleteUser` se `admin_apply_profile_update` fallisce — resta l’utente Auth per ispezionare DB / link invito.
 * In produzione lasciare disattivato.
 */
function skipRollbackAfterRpcInviteFailure(): boolean {
  const v = process.env.DEBUG_SKIP_INVITE_ROLLBACK_ON_RPC_FAIL;
  return v === "1" || v === "true";
}

/** Flusso A: invite email Supabase Auth; l’utente imposta password dal link (nessuna password sul form). */
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
    console.error("[createUserByAdmin] service role env check", {
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
      serviceRoleKeyPrefix: process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 8) ?? "(unset)",
    });
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

  if (role === "specializzando" && annoSpecialita !== undefined && assegnazioneEnum) {
    meta.anno_specialita = annoSpecialita;
    meta.assegnazione = assegnazioneEnum;
  }

  const base = siteUrlForAuthRedirect();
  if (!base) {
    return {
      ok: false,
      error:
        "NEXT_PUBLIC_SITE_URL non configurato nell’ambiente di deploy: senza questo valore gli inviti usano solo il Site URL del progetto Supabase (spesso solo la homepage) senza passare da /set-password. Imposta l’URL pubblico dell’app (es. https://…hosted.app) e includi nei Redirect URLs sia la root sia …/set-password.",
    };
  }

  const inviteOptions = {
    data: meta as Record<string, unknown>,
    redirectTo: `${base}/set-password`,
  };

  console.error("[createUserByAdmin] invite payload", {
    email,
    role,
    meta,
    redirectTo: inviteOptions.redirectTo,
  });

  const { data: invited, error } = await supabase.auth.admin.inviteUserByEmail(email, inviteOptions);

  if (error) {
    console.error("[inviteUserByEmail ERROR]", {
      email,
      redirectTo: inviteOptions.redirectTo,
      formatted: formatAuthAdminErr(error),
      error,
    });
    const msg = error.message.toLowerCase();
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      return {
        ok: false,
        error:
          `[inviteUserByEmail] ${formatAuthAdminErr(error)} — ` +
          "Questa email è già registrata. Usa un altro indirizzo o reimposta l’accesso da Supabase Auth.",
      };
    }
    return {
      ok: false,
      error: `[inviteUserByEmail] ${formatAuthAdminErr(error)} — ${describeSupabaseAuthEmailError(error.message)}`,
    };
  }

  const userId = invited?.user?.id ?? null;
  if (!userId) {
    console.error("[createUserByAdmin] inviteUserByEmail returned no user id", {
      email,
      invited,
    });
    return {
      ok: false,
      error:
        "[inviteUserByEmail] Nessun user.id nella risposta dopo invito riuscito: impossibile applicare metadata / RPC.",
    };
  }

  console.error("[createUserByAdmin] inviteUserByEmail OK", { email, userId });

  {
    const { error: metaErr } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: meta as Record<string, unknown>,
    });
    if (metaErr) {
      console.error("[createUserByAdmin] updateUserById failed", { userId, meta, err: metaErr });
      return {
        ok: false,
        error: `[updateUserById] metadata non salvati: ${formatAuthAdminErr(metaErr)}`,
      };
    }

    const { data: updatedUserRes, error: readMetaErr } = await supabase.auth.admin.getUserById(userId);
    if (readMetaErr) {
      console.error("[createUserByAdmin] getUserById failed after update", { userId, err: readMetaErr });
      return {
        ok: false,
        error: `[getUserById] verifica metadata fallita: ${formatAuthAdminErr(readMetaErr)}`,
      };
    }

    const savedMeta = (updatedUserRes?.user?.user_metadata ?? {}) as Record<string, unknown>;
    if (!savedMeta.role || !savedMeta.nome || !savedMeta.cognome) {
      return {
        ok: false,
        error:
          `[user_metadata] dopo updateUserById/getUserById mancano role/nome/cognome per userId=${userId}. ` +
          `Letto: ${JSON.stringify(savedMeta)}.`,
      };
    }
  }

  /** Allinea hub (profiles + specializzandi_profiles quando serve): copre anche trigger diverso o rollback parziali. */
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

      console.error("[createUserByAdmin] admin_apply_profile_update failed", {
        userId,
        role,
        annoSpecialita,
        assegnazioneEnum,
        message: rpcErr.message,
        details: rpcErr.details,
        hint: rpcErr.hint,
        code: rpcErr.code,
        DEBUG_SKIP_INVITE_ROLLBACK_ON_RPC_FAIL: process.env.DEBUG_SKIP_INVITE_ROLLBACK_ON_RPC_FAIL ?? "(unset)",
        envWouldSkipRollback: skipRollbackAfterRpcInviteFailure(),
      });

      /*
       * TEMP DEBUG: deleteUser disabilitato in codice per verificare che la revision deployata
       * esegua questo ramo. Ripristinare rollback prima della produzione.
       * await supabase.auth.admin.deleteUser(userId);
       */

      return {
        ok: false,
        error:
          `${baseMsg}\nDEBUG: rollback Auth disabilitato nel codice, userId=${String(userId)} — ` +
          `se dopo deploy l’utente non resta in Auth, non stai eseguendo questo bundle.`,
      };
    }
  }

  revalidatePath("/admin/users");

  return {
    ok: true,
    message: `Invito inviato a ${email}. L’utente riceverà il link per impostare la password.`,
  };
}
