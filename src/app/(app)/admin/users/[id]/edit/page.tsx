import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import { appRoles } from "@/lib/auth/roles";
import { pickSpecializzandiProfilesEmbed } from "@/lib/domain/specializzandi-embed";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { EditUserForm, type EditUserInitial } from "./edit-user-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && appRoles.includes(value as AppRole);
}

export default async function AdminEditUserPage({ params }: PageProps) {
  await requireRole(["admin"]);
  const { id } = await params;

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
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();

  const role = data.role as unknown;
  if (!isAppRole(role)) notFound();

  const spez = pickSpecializzandiProfilesEmbed(
    (data as { specializzandi_profiles?: unknown }).specializzandi_profiles,
  );

  const initial: EditUserInitial = {
    id: String(data.id),
    nome: String((data as { nome?: string }).nome ?? ""),
    cognome: String((data as { cognome?: string }).cognome ?? ""),
    email: String((data as { email?: string }).email ?? ""),
    telefono: (data as { telefono?: string | null }).telefono ?? null,
    role,
    is_active: Boolean((data as { is_active?: boolean }).is_active),
    anno_specialita: spez?.anno_specialita ?? null,
    assegnazione: spez?.assegnazione ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title={`Modifica utente · ${initial.nome} ${initial.cognome}`.trim() || initial.email}
        description="Ruolo, stato attivo e (per specializzando) anno e assegnazione sono applicati nel database in modo coerente con i vincoli RLS/trigger."
        actions={
          <Link href="/admin/users" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Torna all’elenco
          </Link>
        }
      />

      <Card title="Profilo utente">
        <EditUserForm initial={initial} />
      </Card>
    </div>
  );
}
