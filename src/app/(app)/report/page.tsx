import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { getLogbookProcedureReportSections } from "@/lib/data/logbook";
import { getLogbookPortfolioReport, normalizePortfolioQuery } from "@/lib/data/logbook-portfolio";

import { PortfolioBreakdownTable } from "./portfolio-breakdown-table";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function paramString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function ReportPage({ searchParams }: PageProps) {
  const profile = await requireSection("report");
  const params = await searchParams;

  const query = normalizePortfolioQuery(
    {
      from: paramString(params?.from),
      to: paramString(params?.to),
      trainee: paramString(params?.trainee),
      category: paramString(params?.category),
    },
    profile,
  );

  const [{ report, categories, traineeOptions, subjectLabel, resolvedQuery }, sectionsRaw] =
    await Promise.all([
      getLogbookPortfolioReport(profile, query),
      getLogbookProcedureReportSections(profile),
    ]);

  const canPickTrainee = profile.role === "tutor" || profile.role === "admin";

  const quickSections = [
    { title: "Settimana", values: sectionsRaw.week },
    { title: "Mese", values: sectionsRaw.month },
    { title: "Ultimi due mesi", values: sectionsRaw.rollingTwoMonths },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Portfolio formativo"
        title="Report procedure"
        description="Totali pesati sulla quantità registrata in logbook. Gli specializzandi vedono solo il proprio portfolio; tutor e admin possono filtrare per persona."
        actions={
          <Link
            href="/logbook"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-accent"
          >
            Vai al logbook
          </Link>
        }
      />

      <Card title="Filtri">
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {canPickTrainee ? (
            <label className="grid gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">Specializzando</span>
              <select
                name="trainee"
                defaultValue={resolvedQuery.traineeId ?? ""}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="">Tutti (visibili al tuo ruolo)</option>
                {traineeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Dal</span>
            <input
              type="date"
              name="from"
              required
              defaultValue={resolvedQuery.from}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-muted-foreground">Al</span>
            <input
              type="date"
              name="to"
              required
              defaultValue={resolvedQuery.to}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            />
          </label>
          <label className="grid gap-1 sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-medium text-muted-foreground">Categoria</span>
            <select
              name="category"
              defaultValue={resolvedQuery.category ?? ""}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
            >
              <option value="">Tutte le categorie</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button
              type="submit"
              className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            >
              Applica filtri
            </button>
          </div>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          {subjectLabel} · periodo {resolvedQuery.from} → {resolvedQuery.to}
          {resolvedQuery.category ? ` · categoria «${resolvedQuery.category}»` : ""}
        </p>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card title="Totale procedure">
          <p className="text-3xl font-semibold tabular-nums">{report.totalQuantity}</p>
          <p className="mt-1 text-sm text-muted-foreground">Somma delle quantità registrate</p>
        </Card>
        <Card title="Registrazioni">
          <p className="text-3xl font-semibold tabular-nums">{report.entryCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">Voci logbook nel periodo</p>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <PortfolioBreakdownTable title="Per ruolo formativo" rows={report.byParticipationRole} />
        </Card>
        <Card>
          <PortfolioBreakdownTable title="Per categoria" rows={report.byCategory} />
        </Card>
      </section>

      <Card title="Dettaglio per procedura">
        <PortfolioBreakdownTable title="Tutte le procedure (ordinate per totale)" rows={report.byProcedure} />
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Anteprima rapida (top 3)</h2>
        <div className="grid gap-6 lg:grid-cols-3">
          {quickSections.map((section) => (
            <Card key={section.title} title={section.title}>
              <div className="space-y-3">
                {section.values.map((item, index) => (
                  <div key={`${section.title}-${index}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                    <span className="text-lg font-semibold tabular-nums">{item.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
