type SupabaseEnv = {
  url: string;
  anonKey: string;
};

let cachedEnv: SupabaseEnv | null = null;

export function getSupabaseEnv(): SupabaseEnv {
  if (cachedEnv) return cachedEnv;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    throw new Error(
      [
        "Supabase configuration error:",
        `Missing environment variable(s): ${missing.join(", ")}`,
        "Define them in your .env.local file, for example:",
        "  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co",
        "  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key",
      ].join(" "),
    );
  }

  const resolved: SupabaseEnv = { url: url!, anonKey: anonKey! };
  cachedEnv = resolved;
  return resolved;
}


