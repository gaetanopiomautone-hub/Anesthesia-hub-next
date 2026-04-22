import { endOfMonth, format, isValid, parse, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import {
  formatDateItalian,
  leaveStatusLabelItalian,
  leaveTypeLabelItalian,
  listLeaveRequests,
  type LeaveRequestRow,
} from "@/lib/data/leave-requests";

import {
  approveLeaveRequestAction,
  createLeaveRequestAction,
  rejectLeaveRequestAction,
  updateLeaveRequestAction,
} from "./actions";
import { ClearOkParam } from "./clear-ok-param";
import { NewLeaveRequestForm } from "./new-leave-request-form";

function requesterLabel(row: LeaveRequestRow) {
  const name = row.requester?.full_name?.trim();
  const email = row.requester?.email?.trim();

  if (name && email) return `${name} · ${email}`;
  if (name) return name;
  if (email) return email;
  return "Richiedente";
}

function personLabel(params: { full_name?: string | null; email?: string | null; fallback: string }) {
  const name = params.full_name?.trim();
  const email = params.email?.trim();

  if (name && email) return `${name} · ${email}`;
  if (name) return name;
  if (email) return email;
  return params.fallback;
}

function approvalMeta(row: LeaveRequestRow) {
  if (!row.reviewed_at) return "—";
  const who = personLabel({
    full_name: row.approver?.full_name,
    email: row.approver?.email,
    fallback: "Revisore",
  });

  return `${who} · ${formatDateItalian(row.reviewed_at)}`;
}

type FeriePageProps = {
  searchParams?: Promise<{ error?: string; errorCode?: string; month?: string; ok?: string }>;
};

const MONTH_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function resolveMonthContext(monthParam?: string) {
  if (!monthParam || !MONTH_PARAM_RE.test(monthParam)) return null;
  const parsed = parse(monthParam, "yyyy-MM", new Date());
  if (!isValid(parsed)) return null;

  const monthStart = startOfMonth(parsed);
  const monthEnd = endOfMonth(parsed);
  const today = new Date();
  const todayYmd = format(today, "yyyy-MM-dd");
  const startYmd = format(monthStart, "yyyy-MM-dd");
  const endYmd = format(monthEnd, "yyyy-MM-dd");
  const monthLabel = format(parsed, "MMMM yyyy", { locale: it });
  const defaultStart = todayYmd >= startYmd && todayYmd <= endYmd ? todayYmd : startYmd;

  return {
    monthLabel,
    minDate: startYmd,
    maxDate: endYmd,
    defaultStartDate: defaultStart,
    defaultEndDate: endYmd,
  };
}

export default async function FeriePage({ searchParams }: FeriePageProps) {
  const profile = await requireSection("ferie");
  const params = await searchParams;
  const monthContextBase = getMonthContext(params?.month);
  if (params?.month && !monthContextBase.isValid) {
    redirect(`/ferie?month=${monthContextBase.yearMonth}`);
  }
  const actionError = params?.error?.trim() ? params.error.trim() : null;
  const actionErrorCode = params?.errorCode?.trim() ? params.errorCode.trim() : null;
  const actionOk = params?.ok === "1";
  const monthContext = resolveMonthContext(monthContextBase.yearMonth);
  const rows = await listLeaveRequests(profile);

  const canCreate = profile.role === "specializzando";
  const canDecide = profile.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ferie e desiderata"
        title="Richieste con approvazione amministrativa"
        description="Lo specializzando inserisce richieste, l'amministrazione o l'addetto turni le valuta rispetto alla copertura del reparto."
      />

      {actionError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {actionErrorCode === "overlap"
            ? "Hai già una richiesta ferie in questo periodo (anche parziale). Modifica quella esistente oppure scegli altre date."
            : actionError}
        </div>
      ) : null}
      {actionOk ? (
        <>
          <ClearOkParam />
          <div role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Richiesta ferie inviata per {monthContext?.monthLabel ?? "il periodo selezionato"}.
          </div>
        </>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card title="Nuova richiesta">
          {canCreate ? (
            <NewLeaveRequestForm
              action={createLeaveRequestAction}
              month={monthContextBase.yearMonth}
              monthLabel={monthContext?.monthLabel ?? monthContextBase.yearMonth}
              defaultStartDate={monthContext?.defaultStartDate}
              defaultEndDate={monthContext?.defaultEndDate}
              minDate={monthContext?.minDate}
              maxDate={monthContext?.maxDate}
              existingLeaves={rows.map((row) => ({
                start: row.start_date,
                end: row.end_date,
                status: row.status,
              }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo gli specializzandi possono creare nuove richieste. Da qui puoi consultare lo storico e, se abilitato, gestire le approvazioni.
            </p>
          )}
        </Card>

        <Card title="Stato richieste">
          <DataTable
            rows={rows}
            columns={[
              {
                header: "Richiedente",
                render: (row) => (
                  <div className="space-y-1">
                    <p className="font-medium">{requesterLabel(row)}</p>
                    <p className="text-xs text-muted-foreground">Creata il {formatDateItalian(row.created_at)}</p>
                  </div>
                ),
              },
              {
                header: "Periodo",
                render: (row) => (
                  <div className="space-y-1">
                    <p>
                      {formatDateItalian(row.start_date)} {"->"} {formatDateItalian(row.end_date)}
                    </p>
                    <p className="text-xs text-muted-foreground">{leaveTypeLabelItalian(row.request_type)}</p>
                  </div>
                ),
              },
              {
                header: "Stato",
                render: (row) => (
                  <div className="space-y-2">
                    <Badge
                      variant={
                        row.status === "pending"
                          ? "warning"
                          : row.status === "approved"
                            ? "success"
                            : row.status === "cancelled"
                              ? "default"
                              : "danger"
                      }
                    >
                      {leaveStatusLabelItalian(row.status)}
                    </Badge>
                    <p className="text-xs text-muted-foreground">Revisione: {approvalMeta(row)}</p>
                  </div>
                ),
              },
              {
                header: "Note",
                render: (row) => <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.reason?.trim() ? row.reason : "—"}</p>,
              },
              {
                header: "Azioni",
                className: "min-w-[260px]",
                render: (row) => {
                  const isOwn = row.user_id === profile.id;
                  const isPending = row.status === "pending";

                  if (canCreate && isOwn && isPending) {
                    return (
                      <form action={updateLeaveRequestAction} className="grid gap-2">
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="month" value={monthContextBase.yearMonth} />
                        <select
                          name="requestType"
                          defaultValue={row.request_type}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                        >
                          <option value="vacation">Ferie</option>
                          <option value="permission">Permesso</option>
                          <option value="sick_leave">Malattia</option>
                          <option value="conference">Congresso</option>
                          <option value="other">Altro</option>
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            name="startDate"
                            type="date"
                            defaultValue={row.start_date}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                          />
                          <input
                            name="endDate"
                            type="date"
                            defaultValue={row.end_date}
                            className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                          />
                        </div>
                        <textarea
                          name="reason"
                          rows={3}
                          defaultValue={row.reason ?? ""}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                          placeholder="Aggiorna motivazione o dettagli"
                        />
                        <button type="submit" className="rounded-lg border border-border bg-background px-3 py-1 text-xs font-medium">
                          Salva modifiche
                        </button>
                        <p className="text-[11px] text-muted-foreground">Modificabile solo finche la richiesta resta in attesa.</p>
                      </form>
                    );
                  }

                  if (canDecide && isPending && !isOwn) {
                    return (
                      <div className="grid gap-3">
                        <form action={approveLeaveRequestAction} className="grid gap-2">
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="month" value={monthContextBase.yearMonth} />
                          <input
                            name="adminNote"
                            className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                            placeholder="Nota opzionale (appesa alla richiesta)"
                          />
                          <button type="submit" className="rounded-lg bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                            Approva
                          </button>
                        </form>
                        <form action={rejectLeaveRequestAction} className="grid gap-2">
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="month" value={monthContextBase.yearMonth} />
                          <input
                            name="adminNote"
                            className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                            placeholder="Motivo rifiuto (opzionale ma consigliato)"
                          />
                          <button type="submit" className="rounded-lg border border-destructive/40 px-3 py-1 text-xs font-medium text-destructive">
                            Rifiuta
                          </button>
                        </form>
                      </div>
                    );
                  }

                  return <span className="text-xs text-muted-foreground">—</span>;
                },
              },
            ]}
          />
        </Card>
      </section>
    </div>
  );
}
