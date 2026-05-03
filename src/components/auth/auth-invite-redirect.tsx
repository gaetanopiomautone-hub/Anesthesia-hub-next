"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Se l’email di invito/reset punta ancora a `/login`, il server non vede hash/token:
 * spostiamo query+hash sulla pagina che inizializza la sessione nel browser.
 */
export function AuthInviteRedirect({ to }: { to: string }) {
  const router = useRouter();

  useEffect(() => {
    const { search, hash } = window.location;
    if (!search && !hash) return;

    if (search.includes("code=")) {
      router.replace(`${to}${search}${hash}`);
      return;
    }

    if (hash && (hash.includes("access_token") || hash.includes("type=") || hash.includes("error"))) {
      router.replace(`${to}${search}${hash}`);
    }
  }, [router, to]);

  return null;
}
