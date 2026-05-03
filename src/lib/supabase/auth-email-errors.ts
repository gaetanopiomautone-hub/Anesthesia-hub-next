/** Traduce errori SMTP/rate-limit di Auth in messaggi leggibili in UI admin. */
export function describeSupabaseAuthEmailError(message: string): string {
  const m = message.trim().toLowerCase();
  if (
    m.includes("rate limit") ||
    m.includes("over_email_send_rate") ||
    m.includes("too many requests") ||
    m.includes("email rate limit") ||
    /\b429\b/.test(m)
  ) {
    return "Troppe email inviate in poco tempo (limite Supabase). Aspetta alcuni minuti prima di riprovare.";
  }
  return message.trim();
}
