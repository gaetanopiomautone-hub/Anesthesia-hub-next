import { format } from "date-fns";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { approveShiftAction, rejectShiftAction } from "@/app/(app)/turni/actions";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { listAssignableUsers, listShiftsInMonth, listSubmittedShiftsInMonth } from "@/lib/data/shifts";
import { normalizeDayInMonth } from "@/lib/dates/day-in-month";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import { canApproveShifts, canProposeShifts } from "@/lib/domain/shift-permissions";
import { assigneeLabel, shiftTypeLabelItalian } from "@/lib/domain/shift-shared";

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

  const normalizedDay = normalizeDayInMonth(params.day, monthContext.yearMonth);
  if (params.day && !normalizedDay) {
    redirect(`/turni?month=${monthContext.yearMonth}`);
  }

  const monthStart = format(monthContext.start, "yyyy-MM-dd");
  const monthEnd = format(monthContext.end, "yyyy-MM-dd");
  const { rows } = await listShiftsInMonth(profile, { monthStart, monthEnd });
  const canPropose = canProposeShifts(profile);
  const canApprove = canApproveShifts(profile);
  const submittedRows = canApprove ? await listSubmittedShiftsInMonth(profile, { monthStart, monthEnd }) : [];
  const assigneeOptions = canApprove
    ? await listAssignableUsers()
    : canPropose
      ? [{ id: profile.id, full_name: profile.full_name, email: profile.email }]
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendario turni"
        title="Assegnazioni operative del mese"
        description="Vista mese/giorno per consultare e assegnare turni con flusso rapido."
      />

      {params.error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {params.error}
        </div>
      ) : null}
      {params.ok === "draft_saved" ? (
        <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Bozza salvata correttamente.
        </div>
      ) : null}
      {params.ok === "submitted" ? (
        <div role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          Proposta inviata per validazione.
        </div>
      ) : null}
      {params.ok === "approved" ? (
        <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Turno approvato.
        </div>
      ) : null}
      {params.ok === "rejected" ? (
        <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Proposta respinta.
        </div>
      ) : null}

      {canApprove ? (
        <Card title="Da validare" description="Proposte inviate dagli specializzandi in attesa di decisione.">
          {submittedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna proposta in attesa per il mese selezionato.</p>
          ) : (
            <div className="space-y-3">
              {submittedRows.map((row) => (
                <div key={`submitted-${row.id}`} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">
                        {row.shift_date} · {shiftTypeLabelItalian(row.shift_type)}
                      </div>
                      <p className="text-xs text-muted-foreground">Assegnatario proposto: {assigneeLabel(row)}</p>
                      <p className="text-xs text-muted-foreground">
                        Proposto da: {row.proposer?.full_name?.trim() || row.proposer?.email?.trim() || row.proposed_by || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <form action={approveShiftAction}>
                        <input type="hidden" name="shiftId" value={row.id} />
                        <input type="hidden" name="userId" value={row.user_id ?? ""} />
                        <input type="hidden" name="month" value={monthContext.yearMonth} />
                        <button
                          type="submit"
                          className="rounded-lg border border-green-200 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50"
                        >
                          Approva
                        </button>
                      </form>
                      <form action={rejectShiftAction}>
                        <input type="hidden" name="shiftId" value={row.id} />
                        <input type="hidden" name="month" value={monthContext.yearMonth} />
                        <button
                          type="submit"
                          className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                        >
                          Rifiuta
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card title="Riepilogo mese">
          <p className="text-sm text-muted-foreground">Mese visualizzato: {monthContext.yearMonth}</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{rows.length}</p>
          <p className="text-sm text-muted-foreground">turni pianificati</p>
        </Card>
        <TurniMonthView
          yearMonth={monthContext.yearMonth}
          initialSelectedDate={normalizedDay}
          rows={rows}
          currentUserId={profile.id}
          currentUserRole={profile.role}
          canPropose={canPropose}
          canApprove={canApprove}
          assigneeOptions={assigneeOptions}
        />
      </section>
    </div>
  );
}
