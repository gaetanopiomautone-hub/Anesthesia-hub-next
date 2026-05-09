import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import { appRoles } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { nomeCognomeFromProfileRow } from "@/lib/utils/profile-display";

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
  const { data, error } = await supabase.from("profiles").select("*");

  const rawProfiles = ((data ?? []) as Record<string, unknown>[]).slice();
  rawProfiles.sort((a, b) => {
    const ac = nomeCognomeFromProfileRow(a).cognome.localeCompare(nomeCognomeFromProfileRow(b).cognome, "it");
    return ac !== 0 ? ac : nomeCognomeFromProfileRow(a).nome.localeCompare(nomeCognomeFromProfileRow(b).nome, "it");
  });

  let spezErrorMessage: string | null = null;
  const ids = rawProfiles.map((r) => String(r.id ?? "")).filter(Boolean);
  const spezByUserId = new Map<string, { anno_specialita: number; assegnazione: string }>();

  if (ids.length > 0 && !error) {
    const { data: spezRows, error: spezErr } = await supabase
      .from("specializzandi_profiles")
      .select("user_id, anno_specialita, assegnazione")
      .in("user_id", ids);

    if (spezErr) {
      spezErrorMessage = spezErr.message;
    } else {
      for (const s of spezRows ?? []) {
        const row = s as { user_id?: string; anno_specialita?: number | string; assegnazione?: string };
        const uid = row.user_id;
        const annoNum = typeof row.anno_specialita === "number" ? row.anno_specialita : Number(row.anno_specialita);
        const asseg = typeof row.assegnazione === "string" ? row.assegnazione : "";
        if (uid && Number.isFinite(annoNum) && asseg) {
          spezByUserId.set(uid, { anno_specialita: annoNum as number, assegnazione: asseg });
        }
      }
    }
  }

  const rawRows = rawProfiles.map((r) => ({
    ...r,
    nome: nomeCognomeFromProfileRow(r).nome,
    cognome: nomeCognomeFromProfileRow(r).cognome,
    email: String(r.email ?? ""),
    role: r.role as unknown,
    telefono: typeof r.telefono === "string" && r.telefono.trim() ? r.telefono : null,
    is_active: typeof r.is_active === "boolean" ? r.is_active : true,
    id: String(r.id ?? ""),
    specializzandi_profiles:
      ids.length === 0 || spezErrorMessage !== null ? null : (spezByUserId.get(String(r.id ?? "")) ?? null),
  })) as {
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
      ) : okBanner === "pw_link_invite" ? (
        <p className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm">
          Invito inviato nuovamente: l’utente riceverà un link per completare la registrazione e impostare la password su /set-password.
        </p>
      ) : okBanner === "pw_link_reset" ? (
        <p className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm">
          Email inviata con un link per impostare la password (reimpostazione o secondo tentativo su invito): l’utente completerà il flusso su /set-password.
        </p>
      ) : null}

      <Card title="Elenco utenti" description={`${rows.length} profili caricati dalla tabella pubblica.`}>
        {spezErrorMessage ? (
          <p className="text-sm text-destructive">
            Impossibile caricare specializzandi_profiles: {spezErrorMessage}
          </p>
        ) : null}
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
