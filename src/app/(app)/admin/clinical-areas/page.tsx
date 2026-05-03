import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/get-current-user-profile";
import { listClinicalAreasAll } from "@/lib/data/clinical-areas";

import { ClinicalAreaEditRow } from "./clinical-area-edit-row";
import { ClinicalAreasForm } from "./clinical-areas-form";

export default async function AdminClinicalAreasPage() {
  await requireRole(["admin"]);
  const areas = await listClinicalAreasAll();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Aree sala (turni)"
        description="Tipo di area / sala per la pianificazione mensile (dove lavora il giorno del turno), distinto dalla sede fisica in «Sale cliniche» e dall’assegnazione formativa abituale dello specializzando."
      />

      <Card title="Nuova area">
        <ClinicalAreasForm />
      </Card>

      <Card
        title="Aree configurate"
        description="Non si eliminano righe: disattiva un’area per nasconderla dai nuovi turni; i turni già collegati restano leggibili."
      >
        {areas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna area.</p>
        ) : (
          <ul className="space-y-3">
            {areas.map((a) => (
              <ClinicalAreaEditRow key={a.id} area={a} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
