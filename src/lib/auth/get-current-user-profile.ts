import { cache } from "react";

import { redirect } from "next/navigation";

import { canAccess } from "@/lib/auth/permissions";
import { appRoles } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { profileDisplayName } from "@/lib/utils/profile-display";

export type CurrentUserProfile = {
  id: string;
  email: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  /** Deriva da `nome`/`cognome` (compat intestazioni/ricerca precedenti). */
  full_name: string;
  role: AppRole;
  anno_specialita: number | null;
  assegnazione: string | null;
  is_active: boolean;
};

function pickSpecializzandiRow(raw: unknown): { anno_specialita: number | null; assegnazione: string | null } | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as { anno_specialita?: number | null; assegnazione?: string | null } | undefined;
    if (!first) return null;
    return {
      anno_specialita: typeof first.anno_specialita === "number" ? first.anno_specialita : null,
      assegnazione: first.assegnazione ?? null,
    };
  }
  const row = raw as { anno_specialita?: number | null; assegnazione?: string | null };
  return {
    anno_specialita: typeof row.anno_specialita === "number" ? row.anno_specialita : null,
    assegnazione: row.assegnazione ?? null,
  };
}

type AppSection =
  | "dashboard"
  | "turni"
  | "turni-ferie"
  | "ferie"
  | "universita"
  | "archivio"
  | "logbook"
  | "report"
  | "admin";

/** Una sola lettura sessione per richiesta (dedup con React cache). */
const getSessionUser = cache(async () => {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.getUser();
});

export const getCurrentUserProfile = cache(async (): Promise<CurrentUserProfile | null> => {
  const {
    data: { user },
    error: userError,
  } = await getSessionUser();

  if (userError || !user) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(`
      id,
      email,
      nome,
      cognome,
      telefono,
      role,
      is_active,
      specializzandi_profiles (
        anno_specialita,
        assegnazione
      )
    `)
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return null;
  }

  if (!appRoles.includes(profile.role as AppRole)) {
    return null;
  }

  const spez = pickSpecializzandiRow(
    (profile as { specializzandi_profiles?: unknown }).specializzandi_profiles,
  );

  const nome = String((profile as { nome?: string }).nome ?? "");
  const cognome = String((profile as { cognome?: string }).cognome ?? "");
  const email = String((profile as { email?: string }).email ?? "");

  return {
    id: String(profile.id),
    email,
    nome,
    cognome,
    telefono: (profile as { telefono?: string | null }).telefono ?? null,
    full_name: profileDisplayName({ nome, cognome, email }),
    role: profile.role as AppRole,
    anno_specialita: spez?.anno_specialita ?? null,
    assegnazione: spez?.assegnazione ?? null,
    is_active: Boolean(profile.is_active),
  };
});

export async function requireUser() {
  const {
    data: { user },
    error: userError,
  } = await getSessionUser();

  if (userError || !user) {
    redirect("/login");
  }

  const profile = await getCurrentUserProfile();
  if (!profile) {
    redirect("/forbidden");
  }

  return profile;
}

export async function requireRole(allowedRoles: AppRole[]) {
  const profile = await requireUser();

  if (!allowedRoles.includes(profile.role)) {
    redirect("/forbidden");
  }

  return profile;
}

export async function requireSection(section: AppSection) {
  const profile = await requireUser();

  if (!canAccess(profile.role, section)) {
    redirect("/forbidden");
  }

  return profile;
}
