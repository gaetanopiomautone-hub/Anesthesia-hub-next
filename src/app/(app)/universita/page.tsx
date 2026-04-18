import { PageHeader } from "@/components/layout/page-header";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { demoUniversityEvents } from "@/lib/data/demo";

export default async function UniversitaPage() {
  await requireSection("universita");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Universita'"
        title="Impegni didattici e calendario accademico"
        description="Lezioni, seminari, sessioni pratiche e attivita' ECM convivono con i turni per evitare conflitti di pianificazione."
      />

      <Card title="Calendario eventi">
        <DataTable
          rows={demoUniversityEvents}
          columns={[
            { header: "Data", render: (row) => row.date },
            { header: "Titolo", render: (row) => row.title },
            { header: "Sede", render: (row) => row.location },
            { header: "Categoria", render: (row) => row.category },
          ]}
        />
      </Card>
    </div>
  );
}
