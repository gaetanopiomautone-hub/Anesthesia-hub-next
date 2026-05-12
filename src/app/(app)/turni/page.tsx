import Link from "next/link";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { listPlanningChangeLogsByPlanId } from "@/lib/data/planning-change-log";
import { listAssignmentLocationsForSalaPlanning } from "@/lib/data/assignment-locations";
import { listClinicalAreasActive } from "@/lib/data/clinical-areas";
import { listTraineeLocationCompetenciesOverlappingMonth } from "@/lib/data/trainee-location-competencies";
import { getMonthlyShiftPlanByYearMonth, listShiftItemsByPlanId } from "@/lib/data/monthly-shift-plans";
import { loadPlanningUnavailabilityForMonth } from "@/lib/data/planning-unavailability";
import { listAssignableUsers } from "@/lib/data/shifts";
import { getTurniShiftPlanMonthState } from "@/lib/data/turni-shift-plan-month-state";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import {
  isMonthlyShiftsPublished,
  monthlyShiftPlanStatusLabelItalian,
  syntheticMonthlyShiftPlanForPrepublishShell,
  type MonthlyShiftPlanStatus,
} from "@/lib/domain/monthly-shifts";
import { redirect } from "next/navigation";
import { cn } from "@/lib/utils/cn";

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

  const dbPlan = await getMonthlyShiftPlanByYearMonth({ year: y, month: m });
  let specPrepublish: { plan_id: string; plan_status: MonthlyShiftPlanStatus } | null = null;
  let specPublishedWithoutPlan = false;
  if (!dbPlan && profile.role === "specializzando") {
    try {
      const st = await getTurniShiftPlanMonthState(y, m);
      if (st.variant === "internal") {
        specPrepublish = { plan_id: st.plan_id, plan_status: st.plan_status };
      } else if (st.variant === "published") {
        specPublishedWithoutPlan = true;
      }
    } catch {
      // RPC assente o errore: trattato come nessun piano visibile
    }
  }

  const items = dbPlan ? await listShiftItemsByPlanId(dbPlan.id) : [];
  const monthStart = format(monthContext.start, "yyyy-MM-dd");
  const monthEnd = format(monthContext.end, "yyyy-MM-dd");
  let planningLeaves: Awaited<ReturnType<typeof loadPlanningUnavailabilityForMonth>>["leaves"] = [];
  let planningBlocks: Awaited<ReturnType<typeof loadPlanningUnavailabilityForMonth>>["blocks"] = [];
  let traineeCompetencyRows: Awaited<ReturnType<typeof listTraineeLocationCompetenciesOverlappingMonth>> = [];
  let changeLogs: Awaited<ReturnType<typeof listPlanningChangeLogsByPlanId>> = [];
  let assigneeOptions: Awaited<ReturnType<typeof listAssignableUsers>> = [];
  let assignmentLocationOptions: { id: string; name: string }[] = [];
  let finalSalaOptions: {
    key: string;
    name: string;
    specialty: string;
    roomName: string | null;
    clinicalAreaId: string;
    source: "planning";
  }[] = [];

  if (dbPlan || specPrepublish) {
    try {
      const u = await loadPlanningUnavailabilityForMonth({ monthStart, monthEnd });
      planningLeaves = u.leaves;
      planningBlocks = u.blocks;
    } catch {
      planningLeaves = [];
      planningBlocks = [];
    }
  }

  if (dbPlan) {
    try {
      traineeCompetencyRows = await listTraineeLocationCompetenciesOverlappingMonth({ monthStart, monthEnd });
    } catch {
      traineeCompetencyRows = [];
    }
    changeLogs = profile.role === "admin" ? await listPlanningChangeLogsByPlanId(dbPlan.id, 250) : [];
    assigneeOptions = await listAssignableUsers();
    const clinicalAreas = await listClinicalAreasActive();
    const assignmentLocations = await listAssignmentLocationsForSalaPlanning();
    assignmentLocationOptions = assignmentLocations.map((a) => ({ id: a.id, name: a.name }));
    finalSalaOptions = clinicalAreas.map((a) => ({
      key: a.id,
      name: `${a.name} · ${a.code}`,
      specialty: a.name,
      roomName: null as string | null,
      clinicalAreaId: a.id,
      source: "planning" as const,
    }));
  }

  const planForView =
    dbPlan ??
    (specPrepublish
      ? syntheticMonthlyShiftPlanForPrepublishShell({
          id: specPrepublish.plan_id,
          year: y,
          month: m,
          status: specPrepublish.plan_status,
        })
      : null);

  const excelAllowedForUser =
    profile.role !== "specializzando" || (dbPlan != null && isMonthlyShiftsPublished(dbPlan));

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
              <Link
                href="/admin/trainee-competencies"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Competenze sale
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
          Piano mese approvato. Le assegnazioni non sono più modificabili. Per l’ufficializzazione al reparto usa
          «Pubblica turni» nella vista del mese.
        </div>
      ) : null}
      {params.ok === "plan_published" ? (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Turni pubblicati al reparto per questo mese.
        </div>
      ) : null}
      {params.ok === "plan_reopened" ? (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Piano mese riaperto: bozza attiva, approvazione e pubblicazione annullate fino a nuovo ciclo.
        </div>
      ) : null}

      {specPublishedWithoutPlan ? (
        <Card
          title="Sincronizzazione in corso"
          description="Il piano risulta pubblicato ma non è ancora visibile alla tua sessione."
        >
          <p className="text-sm text-muted-foreground">
            Ricarica la pagina tra qualche secondo. Se il messaggio persiste, contatta l’amministratore.
          </p>
        </Card>
      ) : !planForView ? (
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
              <p className="text-muted-foreground">
                Periodo: {planForView.year}/{(planForView.month < 10 ? "0" : "") + planForView.month}
              </p>
              <span className="font-medium text-foreground">{monthlyShiftPlanStatusLabelItalian(planForView.status)}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {dbPlan
                ? `${items.length} voci turno in database per questo mese.`
                : "La griglia completa non è visibile finché il coordinamento non pubblica ufficialmente i turni al reparto."}
            </p>
            {dbPlan && planForView.status === "approved" ? (
              isMonthlyShiftsPublished(planForView) ? (
                <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200/90">
                  Turni pubblicati al reparto
                  {planForView.published_at ? (
                    <>
                      {" "}
                      ·{" "}
                      {format(parseISO(planForView.published_at), "dd/MM/yyyy HH:mm", { locale: it })}
                    </>
                  ) : null}
                  .
                </p>
              ) : (
                <p className="mt-2 text-sm text-amber-800 dark:text-amber-200/90">
                  Approvato ma non ancora pubblicato: i specializzandi vedono la griglia solo dopo la pubblicazione
                  ufficiale.
                </p>
              )
            ) : null}
            <div className="mt-4 space-y-3 border-t border-border pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-prose text-xs text-muted-foreground">
                  Export Excel (.xlsx): admin e tutor in ogni stato del piano; specializzandi solo dopo la pubblicazione
                  al reparto (stesso criterio della griglia e del PDF con reperibilità).
                </p>
                {excelAllowedForUser ? (
                  <a
                    href={`/turni/monthly-plan-excel?month=${yearMonth}`}
                    className={cn(buttonVariants({ variant: "default", size: "sm" }), "shrink-0 self-start sm:self-auto")}
                  >
                    Esporta Excel
                  </a>
                ) : (
                  <span
                    className="inline-flex shrink-0 self-start sm:self-auto"
                    title="Disponibile dopo «Pubblica turni» da parte dell’amministrazione."
                  >
                    <button type="button" disabled className={cn(buttonVariants({ variant: "default", size: "sm" }))}>
                      Esporta Excel
                    </button>
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-prose text-xs text-muted-foreground">
                  PDF ufficiale del mese (A4 orizzontale): dopo l’approvazione, tutor e specializzandi possono scaricarlo
                  solo quando il piano è pubblicato al reparto (reperibilità allineata); gli admin possono generarlo anche
                  prima della pubblicazione per uso interno.
                </p>
                {dbPlan &&
                planForView.status === "approved" &&
                (profile.role === "admin" || isMonthlyShiftsPublished(planForView)) ? (
                  <a
                    href={`/turni/monthly-plan-pdf?month=${yearMonth}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "shrink-0 self-start sm:self-auto")}
                  >
                    Genera PDF mensile
                  </a>
                ) : (
                  <span
                    className="inline-flex shrink-0 self-start sm:self-auto"
                    title={
                      !dbPlan
                        ? "Il PDF sarà disponibile dopo la pubblicazione del piano."
                        : planForView.status !== "approved"
                          ? "Approva il piano mensile per abilitare il download del PDF."
                          : "Pubblica il piano al reparto per abilitare il PDF con reperibilità (tutor/specializzandi)."
                    }
                  >
                    <button
                      type="button"
                      disabled
                      className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                    >
                      Genera PDF mensile
                    </button>
                  </span>
                )}
              </div>
            </div>
          </Card>
          <TurniMonthView
            key={`${yearMonth}-${planForView.id}`}
            yearMonth={yearMonth}
            plan={planForView}
            items={items}
            currentUserId={profile.id}
            currentUserRole={profile.role}
            assigneeOptions={assigneeOptions}
            changeLogs={changeLogs}
            salaLocationOptions={finalSalaOptions}
            assignmentLocationOptions={assignmentLocationOptions}
            planningLeaves={planningLeaves}
            planningBlocks={planningBlocks}
            traineeCompetencyRows={traineeCompetencyRows}
            specializzandoPrepublishMode={Boolean(specPrepublish)}
          />
        </section>
      )}
    </div>
  );
}
