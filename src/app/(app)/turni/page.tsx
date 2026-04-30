import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { listActiveSalaOperatoriaLocations } from "@/lib/data/clinical-locations";
import { listPlanningChangeLogsByPlanId } from "@/lib/data/planning-change-log";
import { getMonthlyShiftPlanByYearMonth, listShiftItemsByPlanId } from "@/lib/data/monthly-shift-plans";
import { listAssignableUsers } from "@/lib/data/shifts";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import { monthlyShiftPlanStatusLabelItalian } from "@/lib/domain/monthly-shifts";

import { TurniMonthView } from "./turni-month-view";

type TurniPageProps = {
  searchParams?: Promise<{
    month?: string;
    day?: string;
    ok?: string;
    error?: string;
  }>;
};

export default async function TurniPage({ searchParams }: TurniPageProps) {
  const profile = await requireSection("turni");
  const params = (await searchParams) ?? {};
  const monthContext = getMonthContext(params.month);
  if (params.month && !monthContext.isValid) {
    redirect(`/turni?month=${monthContext.yearMonth}`);
  }

  const y = monthContext.start.getFullYear();
  const m = monthContext.start.getMonth() + 1;
  const yearMonth = monthContext.yearMonth;

  const plan = await getMonthlyShiftPlanByYearMonth({ year: y, month: m });
  const items = plan ? await listShiftItemsByPlanId(plan.id) : [];
  const changeLogs = plan && profile.role === "admin" ? await listPlanningChangeLogsByPlanId(plan.id, 250) : [];
  const assigneeOptions = await listAssignableUsers();
  const salaLocationOptions =
    profile.role === "admin" ? await listActiveSalaOperatoriaLocations() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Turnistica"
        title="Piano turni del mese"
        description="Turni per sala, ambulatorio e reperibilità, legati al planning mensile (import e assegnazioni in un unico flusso)."
        actions={
          profile.role === "admin" ? (
            <div className="flex items-center gap-2">
              <Link
                href="/admin/locations"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Gestisci sale
              </Link>
              <Link
                href="/turni/import"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Import planning Excel
              </Link>
            </div>
          ) : null
        }
      />

      {params.error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}
      {params.ok === "import_done" ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Import turnistica mensile completato: il piano e le voci turno sono stati creati in bozza.
        </div>
      ) : null}
      {params.ok === "plan_submitted" ? (
        <div role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Piano mese segnato come inviato.
        </div>
      ) : null}
      {params.ok === "plan_approved" ? (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Piano mese approvato. Le assegnazioni non sono più modificabili.
        </div>
      ) : null}
      {params.ok === "plan_reopened" ? (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Piano mese riaperto: ora è di nuovo in bozza.
        </div>
      ) : null}

      {!plan ? (
        <Card
          title="Nessun planning per questo mese"
          description="Non esiste un piano attivo in database per il periodo selezionato."
        >
          <p className="text-sm text-muted-foreground">Mese selezionato: {yearMonth}.</p>
          {profile.role === "admin" ? (
            <p className="mt-2 text-sm">
              Crea voci e piano da un file con{" "}
              <Link href="/turni/import" className="text-primary underline-offset-2 hover:underline">
                import Excel
              </Link>
              .
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Contatta l’amministratore per l’import del mese.</p>
          )}
        </Card>
      ) : (
        <section>
          <Card
            className="mb-4"
            title="Piano in database"
            description="Stato e voci per il mese. Naviga mese o modifica mese in alto nella vista sotto."
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <p className="text-muted-foreground">Periodo: {plan.year}/{(plan.month < 10 ? "0" : "") + plan.month}</p>
              <span className="font-medium text-foreground">{monthlyShiftPlanStatusLabelItalian(plan.status)}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {items.length} voci turno in database per questo mese.
            </p>
          </Card>
          <TurniMonthView
            key={`${yearMonth}-${plan.id}`}
            yearMonth={yearMonth}
            plan={plan}
            items={items}
            currentUserId={profile.id}
            currentUserRole={profile.role}
            assigneeOptions={assigneeOptions}
            changeLogs={changeLogs}
            salaLocationOptions={salaLocationOptions}
          />
          {profile.role === "admin" ? (
            <pre className="mt-4 rounded border bg-yellow-50 p-3 text-xs text-black">
              {JSON.stringify(
                {
                  role: profile.role,
                  saleCount: salaLocationOptions.length,
                  saleNames: salaLocationOptions.map((s) => s.name),
                  planStatus: plan.status,
                  isApproved: plan.status === "approved",
                  month: yearMonth,
                },
                null,
                2,
              )}
            </pre>
          ) : null}
        </section>
      )}
    </div>
  );
}
