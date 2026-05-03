import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";

function buildPkceForwardingQuery(sp: Record<string, string | string[] | undefined>): string | null {
  const code = sp.code;
  const err = sp.error;
  const desc = sp.error_description;
  const hasHint =
    (typeof code === "string" && code.length > 0) ||
    (typeof err === "string" && err.length > 0) ||
    (typeof desc === "string" && desc.length > 0);
  if (!hasHint) return null;

  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (raw === undefined) continue;
    const val = Array.isArray(raw) ? raw[0] : raw;
    if (typeof val === "string" && val.length > 0) params.set(key, val);
  }
  const qs = params.toString();
  return qs.length > 0 ? qs : null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const fwd = buildPkceForwardingQuery(sp);
  if (fwd !== null) {
    redirect(`/set-password?${fwd}`);
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/dashboard" : "/login");
}
