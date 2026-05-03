import { SetPasswordForm } from "@/components/forms/set-password-form";

/** Alias per redirect configurati come `/auth/callback/update-password`. */
export default function AuthCallbackUpdatePasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <p className="text-xs uppercase tracking-[0.24em] text-primary">Policlinico San Donato</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">Imposta la password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Completa la registrazione o il reset password con una nuova password per il portale.
        </p>

        <div className="mt-8">
          <SetPasswordForm />
        </div>
      </section>
    </main>
  );
}
