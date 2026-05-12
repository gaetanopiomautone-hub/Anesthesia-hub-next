import Link from "next/link";

import { OwnProfileForm } from "@/app/(app)/profilo/profile-form";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";

export default async function ProfiloPage() {
  const user = await requireSection("profilo");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Il tuo profilo"
        description="Nome, telefono e preferenza per il saluto in dashboard."
        actions={
          <Link href="/dashboard" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Torna alla dashboard
          </Link>
        }
      />
      <Card title="Dati anagrafici">
        <OwnProfileForm
          initial={{
            email: user.email,
            nome: user.nome,
            cognome: user.cognome,
            telefono: user.telefono,
            gender: user.gender,
          }}
        />
      </Card>
    </div>
  );
}
