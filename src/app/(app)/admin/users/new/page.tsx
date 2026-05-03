import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/get-current-user-profile";

import { CreateUserForm } from "./create-user-form";

export default async function AdminNewUserPage() {
  await requireRole(["admin"]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Nuovo utente"
        description="Creazione tramite invito email: l’utente riceve il link da Supabase Auth e imposta la password al primo accesso."
        actions={
          <span className="flex flex-wrap gap-4">
            <Link href="/admin/users" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Elenco utenti
            </Link>
            <Link href="/admin/locations" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Gestione sale
            </Link>
          </span>
        }
      />

      <Card title="Invita utente" description="Nome, cognome, email obbligatori. Per gli specializzandi servono anno e assegnazione di reparto.">
        <CreateUserForm />
      </Card>

      <p className="text-xs text-muted-foreground">
        Richiede SMTP/configurazione email sul progetto Supabase; aggiungi <code className="rounded bg-muted px-1">NEXT_PUBLIC_SITE_URL</code> e il
        redirect in Auth → Redirect URLs (
        <code className="rounded bg-muted px-1">{`{NEXT_PUBLIC_SITE_URL}/login`}</code>).
      </p>
    </div>
  );
}
