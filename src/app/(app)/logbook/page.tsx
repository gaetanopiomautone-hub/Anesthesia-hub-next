import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import {
  autonomyLevelLabel,
  formatLogbookDate,
  listActiveProcedureCatalog,
  listRecentLogbookEntries,
  supervisionLevelLabel,
  type LogbookEntryListRow,
  type ProcedureCatalogRow,
} from "@/lib/data/logbook";

import { createLogbookEntryAction, updateLogbookEntryAction } from "./actions";

function proceduresByCategory(procedures: ProcedureCatalogRow[]) {
  const map = new Map<string, ProcedureCatalogRow[]>();
  for (const p of procedures) {
    const list = map.get(p.category) ?? [];
    list.push(p);
    map.set(p.category, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function ProcedureSelect(props: {
  name: string;
  procedures: ProcedureCatalogRow[];
  defaultProcedureId?: string;
}) {
  const grouped = proceduresByCategory(props.procedures);

  return (
    <select
      name={props.name}
      required
      defaultValue={props.defaultProcedureId ?? ""}
      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
    >
      <option value="" disabled>
        Seleziona una procedura dal catalogo
      </option>
      {grouped.map(([category, items]) => (
        <optgroup key={category} label={category}>
          {items.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function supervisionSelect(name: string, defaultValue?: LogbookEntryListRow["supervision_level"]) {
  return (
    <select
      name={name}
      required
      defaultValue={defaultValue}
      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
    >
      <option value="diretta">Diretta</option>
      <option value="indiretta">Indiretta</option>
      <option value="assente">Assente</option>
    </select>
  );
}

function autonomySelect(name: string, defaultValue?: LogbookEntryListRow["autonomy_level"]) {
  return (
    <select
      name={name}
      required
      defaultValue={defaultValue}
      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
    >
      <option value="assistito">Assistito</option>
      <option value="con_supervisione">Con supervisione</option>
      <option value="autonomo">Autonomo</option>
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
        eyebrow="Logbook procedure"
        title="Registro strutturato senza dati paziente"
        description="Ogni voce include data, procedura dal catalogo, supervisione, autonomia e confidenza. Non inserire nominativi o identificativi del paziente."
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
                Il catalogo procedure e&apos; vuoto o non attivo. Contatta l&apos;amministratore per popolare procedure_catalog.
              </p>
            ) : (
              <form action={createLogbookEntryAction} className="grid gap-4">
                <input name="performedOn" type="date" required className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <ProcedureSelect name="procedureCatalogId" procedures={procedures} />
                {supervisionSelect("supervisionLevel")}
                {autonomySelect("autonomyLevel")}
                <input
                  name="confidence"
                  type="number"
                  min={1}
                  max={5}
                  required
                  placeholder="Confidenza 1-5"
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <textarea
                  name="notes"
                  rows={3}
                  maxLength={2000}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Note cliniche anonime (opzionale), senza identificativi"
                />
                <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                  Salva procedura
                </button>
              </form>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo gli specializzandi registrano nuove procedure. Puoi consultare le voci visibili al tuo ruolo nella tabella a destra.
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
                render: (row) => <span className="font-medium">{row.procedure_catalog?.name ?? "—"}</span>,
              },
              {
                header: "Supervisione",
                render: (row) => <Badge variant="warning">{supervisionLevelLabel(row.supervision_level)}</Badge>,
              },
              {
                header: "Autonomia",
                render: (row) => <Badge variant="default">{autonomyLevelLabel(row.autonomy_level)}</Badge>,
              },
              {
                header: "Confidenza",
                render: (row) => `${row.confidence_level}/5`,
              },
              {
                header: "Note",
                render: (row) => (
                  <p className="max-w-[200px] whitespace-pre-wrap text-xs text-muted-foreground">{row.notes?.trim() ? row.notes : "—"}</p>
                ),
              },
              {
                header: "Azioni",
                className: "min-w-[280px]",
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
                      <ProcedureSelect name="procedureCatalogId" procedures={procedures} defaultProcedureId={row.procedure_catalog_id} />
                      {supervisionSelect("supervisionLevel", row.supervision_level)}
                      {autonomySelect("autonomyLevel", row.autonomy_level)}
                      <input
                        name="confidence"
                        type="number"
                        min={1}
                        max={5}
                        required
                        defaultValue={row.confidence_level}
                        className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                      />
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
