import { format } from "date-fns";
import { it } from "date-fns/locale";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { normalizeDayInMonth } from "@/lib/dates/day-in-month";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import { compareYmd, formatYmd, isValidYearMonth, monthEndYmd, monthStartYmd, toLocalDateFromYmd } from "@/lib/dates/ymd";
import { listFerieCalendarBlocksForMonth } from "@/lib/data/ferie-calendar-blocks";
import { LEAVE_OVERLAP_ERROR_MESSAGE } from "@/lib/data/leave-request-overlap";
import { listLeaveRequests } from "@/lib/data/leave-requests";

import {
  createLeaveRequestAction,
} from "./actions";
import { ClearOkParam } from "./clear-ok-param";
import { FerieMonthView } from "./ferie-month-view";
import { NewLeaveRequestForm } from "./new-leave-request-form";

type FeriePageProps = {
  searchParams?: Promise<{
    error?: string;
    errorCode?: string;
    month?: string;
    day?: string;
    ok?: "created" | "updated" | "approved" | "rejected" | "cancelled" | string;
  }>;
};

/** Contesto calendario (solo visualizzazione mese). */
function resolveMonthViewLabel(monthParam: string) {
  const startYmd = monthStartYmd(monthParam);
  return format(toLocalDateFromYmd(startYmd), "MMMM yyyy", { locale: it });
}

/** Date form: da oggi in avanti, senza limite al mese visualizzato. */
function resolveLeaveFormDateDefaults(params: { day: string | null; viewMonth: string }) {
  const todayYmd = formatYmd(new Date());
  const viewStart = monthStartYmd(params.viewMonth);

  if (params.day && compareYmd(params.day, todayYmd) >= 0) {
    return { minDate: todayYmd, defaultStartDate: params.day, defaultEndDate: params.day };
  }

  const defaultStart = compareYmd(viewStart, todayYmd) >= 0 ? viewStart : todayYmd;

  return { minDate: todayYmd, defaultStartDate: defaultStart, defaultEndDate: defaultStart };
}

export default async function FeriePage({ searchParams }: FeriePageProps) {
  const profile = await requireSection("ferie");
  const params = await searchParams;
  const monthContextBase = getMonthContext(params?.month);
  if (params?.month && !monthContextBase.isValid) {
    redirect(`/ferie?month=${monthContextBase.yearMonth}`);
  }
  const normalizedDay = normalizeDayInMonth(params?.day, monthContextBase.yearMonth);
  if (params?.day && !normalizedDay) {
    const redirectParams = new URLSearchParams();
    redirectParams.set("month", monthContextBase.yearMonth);
    if (params?.ok?.trim()) redirectParams.set("ok", params.ok.trim());
    if (params?.error?.trim()) redirectParams.set("error", params.error.trim());
    if (params?.errorCode?.trim()) redirectParams.set("errorCode", params.errorCode.trim());
    redirect(`/ferie?${redirectParams.toString()}`);
  }
  const actionError = params?.error?.trim() ? params.error.trim() : null;
  const actionErrorCode = params?.errorCode?.trim() ? params.errorCode.trim() : null;
  const actionOk = params?.ok?.trim() || null;
  const monthViewLabel = resolveMonthViewLabel(monthContextBase.yearMonth);
  const formDates = resolveLeaveFormDateDefaults({
    day: normalizedDay,
    viewMonth: monthContextBase.yearMonth,
  });
  const rows = await listLeaveRequests(profile, { yearMonth: monthContextBase.yearMonth });
  const overlapLeaves =
    profile.role === "specializzando"
      ? await listLeaveRequests(profile, { allInView: true })
      : [];
  const calendarBlocks = await listFerieCalendarBlocksForMonth(
    monthStartYmd(monthContextBase.yearMonth),
    monthEndYmd(monthContextBase.yearMonth),
  );

  const canCreate = profile.role === "specializzando";

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
            ? `${LEAVE_OVERLAP_ERROR_MESSAGE} Modifica quella esistente oppure scegli altre date.`
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
                  : actionOk === "cancelled"
                    ? "Richiesta ferie annullata."
                  : `Richiesta ferie inviata per ${monthViewLabel}.`}
          </div>
        </>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div id="new-leave-request">
          <Card title="Nuova richiesta">
          {canCreate ? (
            <NewLeaveRequestForm
              action={createLeaveRequestAction}
              month={monthContextBase.yearMonth}
              day={normalizedDay}
              monthLabel={monthViewLabel}
              defaultStartDate={formDates.defaultStartDate}
              defaultEndDate={formDates.defaultEndDate}
              minDate={formDates.minDate}
              existingLeaves={overlapLeaves.map((row) => ({
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
        </div>

        <FerieMonthView
          yearMonth={monthContextBase.yearMonth}
          initialSelectedDate={normalizedDay}
          rows={rows}
          calendarBlocks={calendarBlocks}
          profileId={profile.id}
          profileRole={profile.role}
          month={monthContextBase.yearMonth}
        />
      </section>
    </div>
  );
}
