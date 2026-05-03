"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Status = "loading" | "ready" | "no_session";

type NoSessionInfo =
  | { variant: "missing_token" }
  | { variant: "bad_or_used"; detail: string | null };

function urlLooksLikeSupabaseAuthCallback(): boolean {
  if (typeof window === "undefined") return false;
  const { search, hash } = window.location;
  const h = hash.startsWith("#") ? hash.slice(1) : hash;

  if (search.includes("code=")) return true;
  if (search.includes("error=") || search.includes("error_description=")) return true;
  if (h.includes("access_token=")) return true;
  if (h.includes("refresh_token=")) return true;
  if (h.includes("error=") || h.includes("error_code=") || h.includes("error_description=")) return true;
  return false;
}

function readAuthErrorFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const page = new URL(window.location.href);
    const qDesc = page.searchParams.get("error_description");
    const qErr = page.searchParams.get("error");
    if (qDesc) return decodeOAuthText(qDesc);
    if (qErr) return qErr;

    const h = window.location.hash.replace(/^#/, "");
    if (!h) return null;
    const hp = new URLSearchParams(h);
    const hDesc = hp.get("error_description");
    const hErr = hp.get("error");
    if (hDesc) return decodeOAuthText(hDesc);
    if (hErr) return hErr;
  } catch {
    /* ignore */
  }
  return null;
}

function decodeOAuthText(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

export function SetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [noSessionInfo, setNoSessionInfo] = useState<NoSessionInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let unsubscribe: (() => void) | undefined;

    async function resolveSession() {
      const hadAuthParamsOnLanding = urlLooksLikeSupabaseAuthCallback();
      const authErrorOnLanding = readAuthErrorFromUrl();

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

      const hadAuthParams =
        hadAuthParamsOnLanding ||
        urlLooksLikeSupabaseAuthCallback();
      const detail = readAuthErrorFromUrl() || authErrorOnLanding;
      setNoSessionInfo(
        hadAuthParams ? { variant: "bad_or_used", detail } : { variant: "missing_token" },
      );
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
    const showBadUsed = noSessionInfo?.variant === "bad_or_used";
    const showMissing = !showBadUsed;

    return (
      <div className="space-y-4">
        {showMissing ? (
          <>
            <p className="text-sm text-rose-600">
              Questa pagina è stata aperta senza parametri dal link Supabase (
              <span className="font-mono text-xs">?code=…</span> oppure hash con{" "}
              <span className="font-mono text-xs">access_token</span>). Senza quel token non si può aprire la sessione per
              impostare la password.
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>
                In Supabase il template Invite/Recovery deve usare il link automatico (
                <span className="font-mono text-xs">{"{{ .ConfirmationURL }}"}</span>), non un URL fisso verso login o
                solo <span className="font-mono text-xs">/set-password</span>.
              </li>
              <li>
                In produzione <span className="font-mono text-xs">NEXT_PUBLIC_SITE_URL</span> deve coincidere con il dominio pubblico (redirect autorizzati inclusi).
              </li>
              <li>
                Genera una mail nuova da <strong>Admin → lista utenti → Invia link password</strong> e apri quella mail una sola volta (meglio copiare il link in finestra anonima; anteprima o doppio clic possono invalidare il link).
              </li>
            </ul>
          </>
        ) : null}

        {showBadUsed ? (
          <>
            <p className="text-sm text-rose-600">
              Il link nella URL sembra incompleto, scaduto, già usato o barrato da un client che l’ha aperto in
              anticipo (anteprima email). Richiedi un nuovo messaggio dalla lista utenti e aprilo una sola volta.
            </p>
            {noSessionInfo?.detail ? (
              <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-xs text-muted-foreground">
                {noSessionInfo.detail}
              </p>
            ) : null}
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>Non riusare messaggi precedenti dopo un deploy di redirect o dopo rate limit.</li>
              <li>Per test sullo stesso utente usa <strong>Invia link password</strong>, non soltanto ripetizioni di “invito nuovo utente”. </li>
            </ul>
          </>
        ) : null}

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
