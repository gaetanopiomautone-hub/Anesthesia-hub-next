"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Status = "loading" | "ready" | "no_session";

export function SetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let unsubscribe: (() => void) | undefined;

    async function resolveSession() {
      const {
        data: { session: initial },
      } = await supabase.auth.getSession();
      if (initial) {
        setStatus("ready");
        return;
      }

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) setStatus("ready");
      });
      unsubscribe = () => listener.subscription.unsubscribe();

      await new Promise((r) => setTimeout(r, 100));
      const {
        data: { session: again },
      } = await supabase.auth.getSession();
      if (again) {
        setStatus("ready");
        return;
      }

      await new Promise((r) => setTimeout(r, 2500));
      const {
        data: { session: final },
      } = await supabase.auth.getSession();
      if (final) {
        setStatus("ready");
        return;
      }

      setStatus("no_session");
    }

    void resolveSession();
    return () => unsubscribe?.();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (password.length < 8) {
      setSubmitError("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (password !== confirm) {
      setSubmitError("Le password non coincidono.");
      return;
    }

    setSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    router.refresh();
    router.replace("/dashboard");
  }

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Verifica del link in corso…
      </p>
    );
  }

  if (status === "no_session") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-rose-600">
          Link non valido, già usato o scaduto. Richiedi un nuovo invito o reimposta la password dall&apos;accesso.
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={() => router.push("/login")}>
          Vai al login
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Nuova password</label>
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Almeno 8 caratteri"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">Ripeti password</label>
        <Input
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Ripeti la password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Salvataggio…" : "Imposta password e continua"}
      </Button>

      {submitError ? <p className="text-sm text-rose-600">{submitError}</p> : null}

      <p className="text-xs text-muted-foreground">
        Dopo il salvataggio verrai indirizzato alla dashboard. Se il link è per il primo accesso, usa credenziali che ricorderai per gli accessi futuri.
      </p>
    </form>
  );
}
