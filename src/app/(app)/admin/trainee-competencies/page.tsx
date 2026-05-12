import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/get-current-user-profile";
import { listAssignmentLocationsActive } from "@/lib/data/assignment-locations";
import { listClinicalAreasAll } from "@/lib/data/clinical-areas";
import { listAssignableUsers } from "@/lib/data/shifts";
import { listTraineeLocationCompetenciesAll } from "@/lib/data/trainee-location-competencies";

import { deleteTraineeLocationCompetencyFormAction } from "@/app/(app)/admin/trainee-competency-actions";
import { TraineeCompetencyAddForm } from "@/app/(app)/admin/trainee-competency-add-form";

function statusLabel(s: string): string {
  switch (s) {
    case "abilitato":
      return "Abilitato";
    case "preferenziale":
      return "Preferenziale";
    case "rotazione":
      return "In rotazione";
    case "non_assegnabile":
      return "Non assegnabile";
    default:
      return s;
  }
}

export default async function TraineeCompetenciesAdminPage() {
  await requireRole(["admin"]);

  const [rows, assignees, locations, areas] = await Promise.all([
    listTraineeLocationCompetenciesAll(),
    listAssignableUsers(),
    listAssignmentLocationsActive(),
    listClinicalAreasAll(),
  ]);

  const locById = new Map(locations.map((l) => [l.id, l]));
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const userById = new Map(assignees.map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Competenze e rotazioni per sala"
        description="Associa ogni specializzando a sale o aree tipo con stato informativo (nessun blocco sul planning)."
        actions={
          <Link
            href="/turni"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Torna ai turni
          </Link>
        }
      />

      <Card title="Nuova competenza / rotazione">
        <TraineeCompetencyAddForm assignees={assignees} locations={locations} areas={areas} />
      </Card>

      <Card title="Elenco registrato" description="Suggerimenti visibili in compilazione turni per chi ha accesso alla sezione.">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna riga ancora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">Specializzando</th>
                  <th className="py-2 pr-2 font-medium">Sala (catalogo)</th>
                  <th className="py-2 pr-2 font-medium">Area tipo</th>
                  <th className="py-2 pr-2 font-medium">Stato</th>
                  <th className="py-2 pr-2 font-medium">Periodo</th>
                  <th className="py-2 pr-2 font-medium">Nota</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const u = userById.get(r.trainee_id);
                  const loc = r.assignment_location_id ? locById.get(r.assignment_location_id) : undefined;
                  const ar = r.clinical_area_id ? areaById.get(r.clinical_area_id) : undefined;
                  const period =
                    r.starts_on || r.ends_on
                      ? `${r.starts_on ?? "…"} → ${r.ends_on ?? "…"}`
                      : "Sempre (nessun limite date)";
                  return (
                    <tr key={r.id} className="border-b border-border/70 align-top">
                      <td className="py-2 pr-2">
                        {u?.list_label.trim() || u?.full_name?.trim() || r.trainee_id}
                      </td>
                      <td className="py-2 pr-2">{loc ? `${loc.name} (${loc.kind})` : "—"}</td>
                      <td className="py-2 pr-2">{ar ? `${ar.name} (${ar.code})` : "—"}</td>
                      <td className="py-2 pr-2">{statusLabel(r.status)}</td>
                      <td className="py-2 pr-2 whitespace-nowrap text-xs text-muted-foreground">{period}</td>
                      <td className="max-w-[12rem] py-2 pr-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                      <td className="py-2">
                        <form action={deleteTraineeLocationCompetencyFormAction}>
                          <input type="hidden" name="competencyId" value={r.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Elimina
                          </Button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
