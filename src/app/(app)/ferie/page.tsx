import { endOfMonth, format, isValid, parse, startOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import { listLeaveRequests, type LeaveRequestRow } from "@/lib/data/leave-requests";

import {
  createLeaveRequestAction,
} from "./actions";
import { ClearOkParam } from "./clear-ok-param";
import { LeaveRequestsList } from "./leave-requests-list";
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

type FeriePageProps = {
  searchParams?: Promise<{ error?: string; errorCode?: string; month?: string; ok?: "created" | "updated" | "approved" | "rejected" | string }>;
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
  const actionOk = params?.ok?.trim() || null;
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
            {actionOk === "updated"
              ? "Richiesta ferie aggiornata."
              : actionOk === "approved"
                ? "Richiesta ferie approvata."
                : actionOk === "rejected"
                  ? "Richiesta ferie rifiutata."
                  : `Richiesta ferie inviata per ${monthContext?.monthLabel ?? "il periodo selezionato"}.`}
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
          <LeaveRequestsList
            rows={rows}
            profileId={profile.id}
            canCreate={canCreate}
            canDecide={canDecide}
            month={monthContextBase.yearMonth}
          />
        </Card>
      </section>
    </div>
  );
}
