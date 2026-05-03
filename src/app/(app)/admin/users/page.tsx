import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import { appRoles } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { AdminUsersTable, type AdminUsersListRow } from "./users-table";

type PageProps = {
  searchParams?: Promise<{ e?: string; ok?: string }>;
};

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && appRoles.includes(value as AppRole);
}

export default async function AdminUsersPage({ searchParams }: PageProps) {
  await requireRole(["admin"]);
  const sp = searchParams ? await searchParams : {};
  const err = typeof sp?.e === "string" ? sp.e : "";
  const okBanner = typeof sp?.ok === "string" ? sp.ok : "";

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      `
      id,
      nome,
      cognome,
      email,
      role,
      telefono,
      is_active,
      specializzandi_profiles (
        anno_specialita,
        assegnazione
      )
    `,
    )
    .order("cognome", { ascending: true })
    .order("nome", { ascending: true });

  const rawRows = (data ?? []) as {
    id: string;
    nome: string;
    cognome: string;
    email: string;
    role: unknown;
    telefono: string | null;
    is_active: boolean;
    specializzandi_profiles: unknown;
  }[];

  const rows: AdminUsersListRow[] = rawRows.flatMap((r) =>
    !isAppRole(r.role)
      ? []
      : ([
          {
            id: r.id,
            nome: r.nome,
            cognome: r.cognome,
            email: r.email,
            telefono: r.telefono,
            is_active: r.is_active,
            role: r.role,
            specializzandi_profiles: r.specializzandi_profiles,
          },
        ] satisfies AdminUsersListRow[]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Utenti"
        description="Elenco utenti dell’hub: anagrafica, ruoli e stato. Per crearne uno nuovo usa il flusso a invito email."
        actions={
          <Link
            href="/admin/users/new"
            className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Nuovo utente (invito)
          </Link>
        }
      />

      {err ? <p className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</p> : null}

      {okBanner === "deactivated" ? (
        <p className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm">Utente disattivato.</p>
      ) : okBanner === "reactivated" ? (
        <p className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm">Utente riattivato.</p>
      ) : null}

      <Card title="Elenco utenti" description={`${rows.length} profili caricati dalla tabella pubblica.`}>
        {error ? (
          <p className="text-sm text-destructive">Errore caricamento: {error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun profilo trovato.</p>
        ) : (
          <AdminUsersTable rows={rows} />
        )}
      </Card>
    </div>
  );
}
