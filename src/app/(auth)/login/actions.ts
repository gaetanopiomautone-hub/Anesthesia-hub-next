"use server";

import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

function formatLoginError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Email o password non corretti. Verifica le credenziali e riprova.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Email non confermata. Completa la verifica dell'account prima di accedere.";
  }

  if (normalized.includes("too many requests")) {
    return "Troppi tentativi di accesso ravvicinati. Attendi qualche minuto e riprova.";
  }

  return message;
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(`/login?error=${encodeURIComponent("Inserisci email e password.")}`);
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(formatLoginError(error.message))}`);
  }

  const {
    data: { user },
    error: sessionError,
  } = await supabase.auth.getUser();

  if (sessionError || !user) {
    redirect(`/login?error=${encodeURIComponent("Sessione non avviata. Riprova.")}`);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent("Account non abilitato o disattivato. Contatta l'amministrazione.")}`);
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  redirect("/login");
}
