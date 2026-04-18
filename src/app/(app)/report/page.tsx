import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { getLogbookProcedureReportSections } from "@/lib/data/logbook";

export default async function ReportPage() {
  const profile = await requireSection("report");
  const sectionsRaw = await getLogbookProcedureReportSections(profile);

  const sections = [
    { title: "Settimana", values: sectionsRaw.week },
    { title: "Mese", values: sectionsRaw.month },
    { title: "Ultimi due mesi", values: sectionsRaw.rollingTwoMonths },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Report procedure"
        title="Analisi per settimana, mese e ultimi due mesi"
        description="Conteggi per procedura (catalogo) sulle voci logbook visibili al tuo ruolo: specializzando vede solo le proprie registrazioni; amministratore le viste complessive. L’ultima colonna usa una finestra mobile da inizio mese scorso a fine mese corrente."
      />

      <section className="grid gap-6 lg:grid-cols-3">
        {sections.map((section) => (
          <Card key={section.title} title={section.title}>
            <div className="space-y-4">
              {section.values.map((item, index) => (
                <div key={`${section.title}-${index}`} className="rounded-2xl border border-border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="text-2xl font-semibold tabular-nums">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
