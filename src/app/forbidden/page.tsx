import Link from "next/link";

import { logoutAction } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-primary">Accesso negato</p>
        <h1 className="mt-3 text-3xl font-semibold text-foreground">Profilo non disponibile o permessi insufficienti</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sei autenticato, ma non abbiamo trovato un profilo attivo in `public.profiles`, oppure non hai i permessi per questa area.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent sm:w-auto"
        >
          Torna al login
        </Link>

        <form action={logoutAction} className="w-full sm:w-auto">
          <Button type="submit" variant="secondary" className="w-full">
            Esci
          </Button>
        </form>
      </div>
    </main>
  );
}
