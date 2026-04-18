import { PageHeader } from "@/components/layout/page-header";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { demoShifts } from "@/lib/data/demo";

export default async function TurniPage() {
  await requireSection("turni");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendario turni"
        title="Assegnazioni di sala operatoria e rianimazione"
        description="Vista pronta per collegare un calendario reale con assegnazioni, coperture, guardie e supervisione."
      />

      <Card title="Legenda">
        <div className="flex flex-wrap gap-3">
          <Badge>Sala operatoria</Badge>
          <Badge variant="danger">Rianimazione</Badge>
          <Badge variant="warning">Guardia / reperibilita&apos;</Badge>
        </div>
      </Card>

      <DataTable
        rows={demoShifts}
        columns={[
          { header: "Data", render: (row) => row.date },
          { header: "Assegnazione", render: (row) => row.unit },
          { header: "Area", render: (row) => row.area },
          { header: "Turno", render: (row) => <Badge>{row.shift}</Badge> },
          { header: "Assegnato a", render: (row) => row.assignedTo },
        ]}
      />
    </div>
  );
}
