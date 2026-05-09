import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import { appRoles } from "@/lib/auth/roles";
import { pickSpecializzandiProfilesEmbed } from "@/lib/domain/specializzandi-embed";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { nomeCognomeFromProfileRow } from "@/lib/utils/profile-display";

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
  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();

  if (error || !data) notFound();

  const raw = data as Record<string, unknown>;
  const nc = nomeCognomeFromProfileRow(raw);

  const role = raw.role as unknown;
  if (!isAppRole(role)) notFound();

  const { data: spezRow } = await supabase
    .from("specializzandi_profiles")
    .select("anno_specialita, assegnazione")
    .eq("user_id", id)
    .maybeSingle();

  const spez = pickSpecializzandiProfilesEmbed(spezRow ?? null);

  const initial: EditUserInitial = {
    id: String(raw.id),
    nome: nc.nome,
    cognome: nc.cognome,
    email: String(raw.email ?? ""),
    telefono: typeof raw.telefono === "string" && raw.telefono.trim() ? raw.telefono : null,
    role,
    is_active: typeof raw.is_active === "boolean" ? raw.is_active : true,
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
