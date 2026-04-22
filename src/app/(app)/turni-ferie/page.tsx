import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { formatDateItalian, leaveTypeLabelItalian } from "@/lib/data/shifts-leave";
import { loadTurniFeriePageData, resolveTurniFerieMonth, shiftKindLabelItalian } from "@/lib/data/shifts-leave";

export default async function TurniFeriePage() {
  const profile = await requireSection("turni-ferie");
  const { monthStart, monthEnd, monthLabel } = resolveTurniFerieMonth(undefined);

  const data = await loadTurniFeriePageData(profile, {
    monthStart,
    monthEnd,
    assigneeId: null,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pianificazione"
        title="Turni & Ferie"
        description={`Vista operativa del mese di ${monthLabel}: turni pianificati e richieste ferie inserite.`}
      />

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
          <p className="text-sm text-muted-foreground">Nessuna richiesta ferie nel periodo selezionato.</p>
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
