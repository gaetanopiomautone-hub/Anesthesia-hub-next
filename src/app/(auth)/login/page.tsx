import { redirect } from "next/navigation";

import { AuthInviteRedirect } from "@/components/auth/auth-invite-redirect";
import { LoginForm } from "@/components/forms/login-form";
import { getCurrentUserProfile } from "@/lib/auth/get-current-user-profile";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const profile = await getCurrentUserProfile();
  if (profile) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-primary">Policlinico San Donato</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">Gestionale anestesia</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dashboard, turni, ferie, archivio didattico e logbook procedure in un&apos;unica piattaforma.
        </p>

        <div className="mt-8">
          <AuthInviteRedirect to="/set-password" />
          <LoginForm error={params?.error} />
        </div>
      </section>
    </main>
  );
}
