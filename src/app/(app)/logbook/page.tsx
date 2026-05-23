import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import {
  formatLogbookDate,
  listActiveProcedureCatalog,
  listRecentLogbookEntries,
  participationRoleLabel,
  procedureCatalogLabel,
  type LogbookEntryListRow,
} from "@/lib/data/logbook";
import { LOGBOOK_PARTICIPATION_ROLE_VALUES } from "@/lib/domain/logbook-participation";

import { createLogbookEntryAction, updateLogbookEntryAction } from "./actions";
import { ProcedureHierarchySelect } from "./procedure-hierarchy-select";

function ParticipationRoleSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: LogbookEntryListRow["participation_role"];
}) {
  return (
    <select
      name={name}
      required
      defaultValue={defaultValue ?? "assistito"}
      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
    >
      {LOGBOOK_PARTICIPATION_ROLE_VALUES.map((v) => (
        <option key={v} value={v}>
          {participationRoleLabel(v)}
        </option>
      ))}
    </select>
  );
}

type LogbookPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function LogbookPage({ searchParams }: LogbookPageProps) {
  const profile = await requireSection("logbook");
  const params = await searchParams;
  const actionError = params?.error?.trim() ? params.error.trim() : null;
  const [procedures, entries] = await Promise.all([listActiveProcedureCatalog(), listRecentLogbookEntries(profile, 40)]);

  const canRecord = profile.role === "specializzando";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Registro procedure"
        title="Logbook formativo anestesiologico"
        description="Registra procedure per categoria, tipo e sottotipo. Ogni voce ha data, quantità e ruolo formativo (osservato → autonomo). Nessun dato identificativo del paziente."
      />

      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {actionError}
        </div>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card title="Nuova procedura">
          {canRecord ? (
            procedures.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Il catalogo procedure non è disponibile. Contatta l&apos;admin dopo l&apos;aggiornamento del database.
              </p>
            ) : (
              <form action={createLogbookEntryAction} className="grid gap-4">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Data</span>
                  <input
                    name="performedOn"
                    type="date"
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <ProcedureHierarchySelect name="procedureCatalogId" procedures={procedures} />
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Quantità</span>
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={999}
                    defaultValue={1}
                    required
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Ruolo formativo</span>
                  <ParticipationRoleSelect name="participationRole" />
                </label>
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Note cliniche anonime (opzionale)"
                />
                <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  Salva procedura
                </button>
              </form>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo gli specializzandi registrano nuove procedure. Tutor e admin possono consultare il registro nella tabella.
            </p>
          )}
        </Card>

        <Card title="Voci recenti">
          <DataTable
            rows={entries}
            columns={[
              {
                header: "Data",
                render: (row) => formatLogbookDate(row.performed_on),
              },
              {
                header: "Procedura",
                render: (row) => (
                  <span className="font-medium">
                    {row.procedure_catalog ? procedureCatalogLabel(row.procedure_catalog) : "—"}
                  </span>
                ),
              },
              {
                header: "Qtà",
                render: (row) => row.quantity,
              },
              {
                header: "Ruolo",
                render: (row) => (
                  <Badge variant="default">{participationRoleLabel(row.participation_role)}</Badge>
                ),
              },
              {
                header: "Note",
                render: (row) => (
                  <p className="max-w-[200px] whitespace-pre-wrap text-xs text-muted-foreground">
                    {row.notes?.trim() ? row.notes : "—"}
                  </p>
                ),
              },
              {
                header: "Azioni",
                className: "min-w-[300px]",
                render: (row) => {
                  if (!canRecord || row.trainee_profile_id !== profile.id || procedures.length === 0) {
                    return <span className="text-xs text-muted-foreground">—</span>;
                  }

                  return (
                    <form action={updateLogbookEntryAction} className="grid gap-2">
                      <input type="hidden" name="id" value={row.id} />
                      <input
                        name="performedOn"
                        type="date"
                        required
                        defaultValue={row.performed_on}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      />
                      <ProcedureHierarchySelect
                        name="procedureCatalogId"
                        procedures={procedures}
                        defaultProcedureId={row.procedure_catalog_id}
                      />
                      <input
                        name="quantity"
                        type="number"
                        min={1}
                        max={999}
                        required
                        defaultValue={row.quantity}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      />
                      <ParticipationRoleSelect name="participationRole" defaultValue={row.participation_role} />
                      <textarea
                        name="notes"
                        rows={2}
                        maxLength={2000}
                        defaultValue={row.notes ?? ""}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        placeholder="Note (opzionale)"
                      />
                      <button type="submit" className="rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium">
                        Aggiorna
                      </button>
                    </form>
                  );
                },
              },
            ]}
          />
        </Card>
      </section>
    </div>
  );
}
