import { cache } from "react";

import { redirect } from "next/navigation";

import { canAccess } from "@/lib/auth/permissions";
import { appRoles } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CurrentUserProfile = {
  id: string;
  email: string;
  full_name: string;
  role: AppRole;
  year_of_training: number | null;
  is_active: boolean;
};

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
    .select("id, email, full_name, role, year_of_training, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.is_active) {
    return null;
  }

  if (!appRoles.includes(profile.role as AppRole)) {
    return null;
  }

  return profile as CurrentUserProfile;
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
