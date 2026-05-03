import { PageHeader } from "@/components/layout/page-header";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { roleLabels } from "@/lib/auth/roles";
import { autonomyLabel, getDashboardData, leaveStatusLabel, supervisionLabel } from "@/lib/data/dashboard";
import { leaveTypeLabelItalian } from "@/lib/data/leave-requests";

export default async function DashboardPage() {
  const user = await requireSection("dashboard");
  const dashboard = await getDashboardData(user);

  const roleHighlights = {
    specializzando: "Vedi i tuoi turni, inserisci ferie, aggiorna il logbook e controlla la progressione procedure.",
    tutor: "Monitora copertura sale, valida richieste e supervisiona la progressione formativa.",
    admin: "Controlla permessi, approvazioni, materiali didattici e governance complessiva del reparto.",
  } as const;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard"
        title={`Benvenuta, ${user.nome?.trim() || user.full_name}`}
        description={roleHighlights[user.role]}
        actions={<Badge>{roleLabels[user.role]}</Badge>}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Turni settimana">
          <p className="text-3xl font-semibold">{dashboard.weekShiftCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">{dashboard.weekShiftSubtitle}</p>
        </Card>
        <Card title="Ultime richieste">
          <p className="text-3xl font-semibold">{dashboard.leaveRows.length}</p>
          <p className="mt-1 text-sm text-muted-foreground">Ultime leave_requests visibili al tuo ruolo</p>
        </Card>
        <Card title="Procedure mese">
          {dashboard.canViewProcedureMetrics ? (
            <p className="text-3xl font-semibold">{dashboard.monthProcedureCount}</p>
          ) : (
            <p className="text-lg font-semibold text-muted-foreground">Non disponibile</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">{dashboard.procedureSubtitle}</p>
        </Card>
        <Card title={dashboard.fourthCardTitle}>
          <p className="text-3xl font-semibold">{dashboard.pendingLeaveCount}</p>
          <p className="mt-1 text-sm text-muted-foreground">{dashboard.fourthCardSubtitle}</p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Prossima assegnazione" description="Dal calendario turni reale">
          <div className="space-y-3">
            <p className="text-lg font-semibold">{dashboard.nextShiftTitle}</p>
            <p className="text-sm text-muted-foreground">{dashboard.nextShiftSubtitle}</p>
            <Badge variant="success">{dashboard.nextShiftBadge}</Badge>
            {dashboard.upcomingShifts.length > 1 ? (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prossimi turni</p>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {dashboard.upcomingShifts.slice(1, 4).map((shift) => (
                    <li key={shift.id} className="flex items-center justify-between gap-3">
                      <span>{dashboard.formatDate(shift.shift_date)}</span>
                      <span className="text-right text-foreground">
                        {shift.clinical_locations?.name ?? "Sede da assegnare"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        <Card title="Attenzione" description="Notifiche utili per il ruolo corrente">
          <ul className="space-y-3 text-sm text-muted-foreground">
            {user.role === "admin" ? (
              <li>Verifica le richieste in attesa prima di modificare turni critici.</li>
            ) : null}
            {user.role === "specializzando" ? (
              <li>Controlla copertura e tutoraggio prima di richiedere ferie.</li>
            ) : null}
            <li>Le procedure vengono registrate senza alcun identificativo paziente.</li>
          </ul>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card title="Ultime procedure">
          <div className="space-y-3">
            {dashboard.logbookRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna procedura recente disponibile per questo ruolo.</p>
            ) : (
              dashboard.logbookRows.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{entry.procedure_catalog?.name ?? "Procedura"}</p>
                    <Badge>{autonomyLabel(entry.autonomy_level)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {dashboard.formatDate(entry.performed_on)} · Supervisione {supervisionLabel(entry.supervision_level)} ·
                    Confidenza {entry.confidence_level}/5
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Richieste recenti" description="Ultime leave_requests visibili al tuo ruolo">
          <div className="space-y-3">
            {dashboard.leaveRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna richiesta recente.</p>
            ) : (
              dashboard.leaveRows.map((leave) => (
                <div key={leave.id} className="rounded-2xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">
                      {leaveTypeLabelItalian(leave.request_type)}
                    </p>
                    <Badge>{leaveStatusLabel(leave.status)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {dashboard.formatDate(leave.start_date)} → {dashboard.formatDate(leave.end_date)}
                  </p>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
