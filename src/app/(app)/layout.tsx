import { AppShell } from "@/components/layout/app-shell";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth/get-current-user-profile";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  try {
    const profile = await requireUser();

    return (
      <AppShell userName={profile.full_name} role={profile.role}>
        {children}
      </AppShell>
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error("LAYOUT ERROR:", error);

    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}${error.stack ? `\n\n${error.stack}` : ""}`
        : typeof error === "object" && error !== null
          ? JSON.stringify(error, null, 2)
          : String(error);

    return (
      <div className="space-y-4 rounded-xl border border-destructive/50 bg-destructive/10 p-6 text-sm text-foreground">
        <h2 className="text-lg font-semibold text-destructive">Errore layout applicativo</h2>
        <p className="text-muted-foreground">
          Copia il testo qui sotto (o uno screenshot) e incollalo nel ticket: contiene il messaggio reale dell&apos;errore server.
        </p>
        <pre className="max-h-[min(480px,70vh)] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-4 font-mono text-xs">
          {detail}
        </pre>
      </div>
    );
  }
}
