import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import { formatDateItalian, leaveTypeLabelItalian } from "@/lib/data/shifts-leave";
import { adjacentMonthYearMonth, loadTurniFeriePageData, resolveTurniFerieMonth, shiftKindLabelItalian } from "@/lib/data/shifts-leave";

type TurniFeriePageProps = {
  searchParams?: Promise<{ month?: string; m?: string }>;
};

export default async function TurniFeriePage({ searchParams }: TurniFeriePageProps) {
  const profile = await requireSection("turni-ferie");
  const sp = (await searchParams) ?? {};
  const monthParam = sp.month ?? sp.m;
  const monthContext = getMonthContext(monthParam);
  if (monthParam && !monthContext.isValid) {
    redirect(`/turni-ferie?month=${monthContext.yearMonth}`);
  }
  const { yearMonth, monthStart, monthEnd, monthLabel } = resolveTurniFerieMonth(monthContext.yearMonth);

  const data = await loadTurniFeriePageData(profile, {
    monthStart,
    monthEnd,
    assigneeId: null,
  });
  const prevMonth = adjacentMonthYearMonth(yearMonth, -1);
  const nextMonth = adjacentMonthYearMonth(yearMonth, 1);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pianificazione"
        title="Turni & Ferie"
        description={`Vista operativa del mese di ${monthLabel}: turni pianificati e richieste ferie inserite.`}
        actions={
          <Link href={`/ferie?month=${yearMonth}`} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Nuova richiesta ferie
          </Link>
        }
      />

      <Card title="Periodo">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/turni-ferie?month=${prevMonth}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
            ← Mese precedente
          </Link>
          <p className="text-sm font-medium capitalize text-foreground">{monthLabel}</p>
          <Link href={`/turni-ferie?month=${nextMonth}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
            Mese successivo →
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Turni nel mese">
          <p className="text-3xl font-semibold text-foreground">{data.shifts.length}</p>
        </Card>
        <Card title="Richieste ferie nel mese">
          <p className="text-3xl font-semibold text-foreground">{data.leaves.length}</p>
        </Card>
        <Card title="Conflitti rilevati">
          <p className="text-3xl font-semibold text-foreground">{data.conflicts.length}</p>
        </Card>
      </div>

      <Card title="Turni" description="Elenco turni del mese.">
        {data.shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun turno pianificato per questo mese.</p>
        ) : (
          <div className="space-y-2">
            {data.shifts.map((shift) => (
              <div key={shift.id} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <span className="font-medium">{formatDateItalian(shift.shift_date)}</span>
                <span className="mx-2 text-muted-foreground">—</span>
                <span>{shiftKindLabelItalian(shift.shift_kind)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Richieste ferie" description="Richieste che si sovrappongono almeno in parte al mese visualizzato.">
        {data.leaves.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Nessuna richiesta ferie nel periodo selezionato.</p>
            <Link href={`/ferie?month=${yearMonth}`} className="inline-flex rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary">
              Nuova richiesta ferie
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {data.leaves.map((leave) => (
              <div key={leave.id} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <span className="font-medium">{leaveTypeLabelItalian(leave.request_type)}</span>
                <span className="mx-2 text-muted-foreground">—</span>
                <span>
                  {formatDateItalian(leave.start_date)} → {formatDateItalian(leave.end_date)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
