/** URL pubblico dell’app (senza slash finale). Usato per redirectTo in inviti e reset password. */
export function siteUrlForAuthRedirect(): string | undefined {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return undefined;
}
