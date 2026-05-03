"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { logoutAction } from "@/app/(auth)/login/actions";
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

/** True se l’URL contiene ancora token da consumare (PKCE o implicit grant), non solo messaggi di errore. */
function urlHasConsumableAuthExchange(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.search.includes("code=")) return true;
  const h = window.location.hash.replace(/^#/, "");
  return h.includes("access_token=");
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
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const openedWithInviteOrResetLink = useRef(false);
  const [logoutPending, startLogout] = useTransition();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let unsubscribe: (() => void) | undefined;

    async function resolveSession() {
      const hadAuthParamsOnLanding = urlLooksLikeSupabaseAuthCallback();
      const authErrorOnLanding = readAuthErrorFromUrl();
      const consumable = urlHasConsumableAuthExchange();
      openedWithInviteOrResetLink.current = hadAuthParamsOnLanding;

      // Sessione già presente (es. admin) blocca l’exchange del link: esci in locale così il token in URL viene consumato per l’utente giusto.
      if (consumable) {
        await supabase.auth.signOut({ scope: "local" });
      }

      // Errore OAuth in query/hash senza token da scambiare → non mostrare il form con un’altra sessione.
      if (hadAuthParamsOnLanding && !consumable && authErrorOnLanding) {
        setNoSessionInfo({ variant: "bad_or_used", detail: authErrorOnLanding });
        setStatus("no_session");
        return;
      }

      const {
        data: { session: first },
      } = await supabase.auth.getSession();

      if (first && !hadAuthParamsOnLanding) {
        setSessionEmail(first.user.email ?? null);
        setStatus("ready");
        return;
      }

      if (first && hadAuthParamsOnLanding && consumable) {
        setSessionEmail(first.user.email ?? null);
        setStatus("ready");
        return;
      }

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setSessionEmail(session.user.email ?? null);
          setStatus("ready");
        }
      });
      unsubscribe = () => listener.subscription.unsubscribe();

      await new Promise((r) => setTimeout(r, 100));
      const {
        data: { session: again },
      } = await supabase.auth.getSession();
      if (again) {
        setSessionEmail(again.user.email ?? null);
        setStatus("ready");
        return;
      }

      await new Promise((r) => setTimeout(r, 2500));
      const {
        data: { session: final },
      } = await supabase.auth.getSession();
      if (final) {
        setSessionEmail(final.user.email ?? null);
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

    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
      error: sessionErr,
    } = await supabase.auth.getSession();

    if (sessionErr || !session?.user) {
      setSubmitError("Sessione non disponibile. Ricarica la pagina o apri di nuovo il link dall’email.");
      return;
    }

    if (openedWithInviteOrResetLink.current) {
      const email = session.user.email?.trim().toLowerCase();
      if (!email) {
        setSubmitError("Impossibile verificare l’account: email assente sulla sessione. Apri il link in finestra anonima dopo logout.");
        return;
      }
    }

    setSubmitting(true);
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
    <div className="space-y-5">
      {sessionEmail ? (
        <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <p>
            Stai impostando la password per: <span className="font-medium text-foreground">{sessionEmail}</span>
          </p>
          {openedWithInviteOrResetLink.current ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Se non è l’utente previsto:</span>
              <button
                type="button"
                disabled={logoutPending}
                className="font-medium text-primary underline underline-offset-2 hover:text-primary/90 disabled:opacity-50"
                onClick={() =>
                  startLogout(() => {
                    void logoutAction();
                  })
                }
              >
                {logoutPending ? "Uscita…" : "Esci dall’account"}
              </button>
              <span>e riapri il link in finestra anonima.</span>
            </p>
          ) : null}
        </div>
      ) : null}

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
    </div>
  );
}
