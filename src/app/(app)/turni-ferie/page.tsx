import Link from "next/link";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { leaveStatusLabelItalian } from "@/lib/data/leave-requests";
import {
  adjacentMonthYearMonth,
  assigneeDisplayName,
  countShiftOverlapAlerts,
  formatDateItalian,
  leaveTypeLabelItalian,
  loadTurniFeriePageData,
  requesterDisplayName,
  resolveTurniFerieMonth,
  shiftAreaLabel,
  shiftKindLabelItalian,
  type ShiftListRow,
  type ShiftWithLeaveUi,
} from "@/lib/data/shifts-leave";

type TurniFeriePageProps = {
  searchParams?: Promise<{ m?: string; assignee?: string; conflitti?: string }>;
};

function leaveStatusBadge(status: ShiftWithLeaveUi["leaveStatus"]) {
  if (status === "none") return <span className="text-muted-foreground">—</span>;
  if (status === "pending") return <Badge variant="warning">{leaveStatusLabelItalian(status)}</Badge>;
  if (status === "approved") return <Badge variant="default">{leaveStatusLabelItalian(status)}</Badge>;
  if (status === "rejected") return <Badge variant="danger">{leaveStatusLabelItalian(status)}</Badge>;
  return <Badge variant="default">{leaveStatusLabelItalian(status)}</Badge>;
}

function alertBadge(alert: ShiftWithLeaveUi["alert"]) {
  if (alert === "hard") return <Badge variant="danger">Conflitto</Badge>;
  if (alert === "soft") return <Badge variant="warning">Attenzione</Badge>;
  return <span className="text-muted-foreground">—</span>;
}

function impactedSummary(shifts: ShiftListRow[]) {
  return shifts
    .map((s) => `${shiftKindLabelItalian(s.shift_kind)} ${formatDateItalian(s.shift_date)}`)
    .join(" · ");
}

export default async function TurniFeriePage({ searchParams }: TurniFeriePageProps) {
  const profile = await requireSection("turni-ferie");
  const sp = (await searchParams) ?? {};
  const { yearMonth, monthStart, monthEnd, monthLabel } = resolveTurniFerieMonth(sp.m);

  let assigneeId: string | null = null;
  if (profile.role === "admin" && sp.assignee?.trim()) {
    const parsed = z.string().uuid().safeParse(sp.assignee.trim());
    assigneeId = parsed.success ? parsed.data : null;
  }

  const { shiftUi, conflicts, assigneeOptions } = await loadTurniFeriePageData(profile, {
    monthStart,
    monthEnd,
    assigneeId,
  });

  const soloConflitti = sp.conflitti === "1" || sp.conflitti === "true";
  const shiftRowsFiltered = soloConflitti ? shiftUi.filter((r) => r.alert !== "none") : shiftUi;

  const overlap = countShiftOverlapAlerts(shiftUi);
  const isTrainee = profile.role === "specializzando";
  const isSchedulerOrAdmin = profile.role === "tutor" || profile.role === "admin";

  const showGlobalTrainee = isTrainee && overlap.total > 0;
  const showGlobalStaff = isSchedulerOrAdmin && conflicts.length > 0;

  const prevM = adjacentMonthYearMonth(yearMonth, -1);
  const nextM = adjacentMonthYearMonth(yearMonth, 1);
  const assigneeQuery = assigneeId ? `&assignee=${assigneeId}` : "";
  const conflittiQuery = soloConflitti ? "&conflitti=1" : "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pianificazione"
        title="Turni & Ferie"
        description="Turni del mese con stato delle richieste ferie/desiderata e avvisi se un turno cade in un periodo richiesto o già approvato. I conflitti su richieste in attesa sono segnalazioni operative, non blocchi."
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/turni-ferie?m=${prevM}${assigneeQuery}${conflittiQuery}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            ← Mese precedente
          </Link>
          <p className="min-w-[10rem] text-center text-sm font-semibold capitalize text-foreground">{monthLabel}</p>
          <Link
            href={`/turni-ferie?m=${nextM}${assigneeQuery}${conflittiQuery}`}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Mese successivo →
          </Link>
        </div>

        {profile.role === "admin" ? (
          <form action="/turni-ferie" method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="m" value={yearMonth} />
            {soloConflitti ? <input type="hidden" name="conflitti" value="1" /> : null}
            <label className="text-xs text-muted-foreground">
              Specializzando
              <select
                name="assignee"
                defaultValue={assigneeId ?? ""}
                className="ml-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Tutti</option>
                {assigneeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name?.trim() || u.email}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Applica
            </button>
          </form>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Alert sui turni del mese:</span>
          <Badge variant="warning">
            Attenzione <span className="tabular-nums">{overlap.soft}</span>
          </Badge>
          <Badge variant="danger">
            Conflitto <span className="tabular-nums">{overlap.hard}</span>
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {overlap.total > 0 && !soloConflitti ? (
            <Link
              href={`/turni-ferie?m=${yearMonth}${assigneeQuery}&conflitti=1`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Solo turni con alert
            </Link>
          ) : null}
          {soloConflitti ? (
            <Link
              href={`/turni-ferie?m=${yearMonth}${assigneeQuery}`}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Mostra tutti i turni
            </Link>
          ) : null}
        </div>
      </div>

      {showGlobalTrainee ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">
            Hai {overlap.total} {overlap.total === 1 ? "sovrapposizione" : "sovrapposizioni"} tra turni assegnati e ferie o
            desiderata nel mese ({overlap.soft} in attesa, {overlap.hard} con ferie già approvata).
          </p>
          <a href="#conflitti" className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
            Vai ai dettagli conflitto
          </a>
        </div>
      ) : null}

      {showGlobalStaff ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          <p className="font-medium">
            {conflicts.length}{" "}
            {conflicts.length === 1 ? "richiesta impatta" : "richieste impattano"} turni già assegnati nel mese (ferie o
            desiderata).
          </p>
          <a href="#conflitti" className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
            Vai all&apos;elenco operativo
          </a>
        </div>
      ) : null}

      <Card
        title="Turni nel mese"
        description={
          soloConflitti
            ? "Filtro attivo: solo righe con alert (richiesta in attesa o ferie già approvata sul giorno del turno)."
            : "Solo turni con assegnatario; alert se il giorno cade in un periodo di ferie/desiderata."
        }
      >
        {soloConflitti && shiftRowsFiltered.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">Nessun turno con alert in questo mese (con il filtro attuale).</p>
        ) : null}
        <DataTable
          rows={shiftRowsFiltered}
          columns={[
            {
              header: "Data",
              render: (row) => formatDateItalian(row.shift_date),
            },
            {
              header: "Turno",
              render: (row) => shiftKindLabelItalian(row.shift_kind),
            },
            {
              header: "Area / sede",
              render: (row) => shiftAreaLabel(row),
            },
            ...(!isTrainee
              ? [
                  {
                    header: "Assegnato a",
                    render: (row: ShiftWithLeaveUi) => assigneeDisplayName(row),
                  },
                ]
              : []),
            {
              header: "Stato ferie",
              render: (row) => leaveStatusBadge(row.leaveStatus),
            },
            {
              header: "Alert",
              render: (row) => alertBadge(row.alert),
            },
          ]}
        />
      </Card>

      {conflicts.length > 0 ? (
        <div id="conflitti">
          <Card
            title="Conflitti (operativo)"
            description="Richieste che si sovrappongono a turni già assegnati allo stesso specializzando. Gestisci le richieste dalla pagina Ferie."
          >
            <DataTable
              rows={conflicts}
              columns={[
                {
                  header: "Richiedente / periodo",
                  className: "min-w-[200px]",
                  render: (row) => (
                    <div className="space-y-1">
                      {!isTrainee ? <p className="font-medium">{requesterDisplayName(row.leave)}</p> : null}
                      <p className="text-sm text-muted-foreground">
                        {leaveTypeLabelItalian(row.leave.request_type)} · {formatDateItalian(row.leave.start_date)} →{" "}
                        {formatDateItalian(row.leave.end_date)}
                      </p>
                    </div>
                  ),
                },
                {
                  header: "Turni coinvolti",
                  render: (row) => <p className="text-sm text-muted-foreground">{impactedSummary(row.impactedShifts)}</p>,
                },
                {
                  header: "Stato richiesta",
                  render: (row) => (
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={row.leave.status === "pending" ? "warning" : "default"}>
                        {leaveStatusLabelItalian(row.leave.status)}
                      </Badge>
                      <Badge variant={row.kind === "hard" ? "danger" : "warning"}>
                        {row.kind === "hard" ? "Conflitto confermato" : "Solo avviso"}
                      </Badge>
                    </div>
                  ),
                },
                {
                  header: "Azioni",
                  className: "w-[1%] whitespace-nowrap",
                  render: () => (
                    <Link
                      href="/ferie"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Apri ferie
                    </Link>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
