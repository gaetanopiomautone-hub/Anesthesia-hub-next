import { format } from "date-fns";
import { it } from "date-fns/locale";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { hasDateOverlap } from "@/lib/dates/hasDateOverlap";
import { normalizeDayInMonth } from "@/lib/dates/day-in-month";
import { getMonthContext } from "@/lib/dates/getMonthContext";
import { compareYmd, formatYmd, monthEndYmd, monthStartYmd, toLocalDateFromYmd } from "@/lib/dates/ymd";
import { listFerieCalendarBlocksForMonth } from "@/lib/data/ferie-calendar-blocks";
import { LEAVE_OVERLAP_ERROR_MESSAGE } from "@/lib/data/leave-request-overlap";
import { listLeaveRequests } from "@/lib/data/leave-requests";

import {
  createLeaveRequestAction,
} from "./actions";
import { ClearOkParam } from "./clear-ok-param";
import { FerieMonthView } from "./ferie-month-view";
import { LeaveRequestsList } from "./leave-requests-list";
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

function filterRowsByDay(rows: Awaited<ReturnType<typeof listLeaveRequests>>, day: string | null) {
  if (!day) return rows;
  return rows.filter((r) => hasDateOverlap(day, day, r.start_date, r.end_date));
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

  const calendarRequests = await listLeaveRequests(profile, {
    scope: "calendar",
    yearMonth: monthContextBase.yearMonth,
  });
  const visibleRequests = await listLeaveRequests(profile, { includeAllFuture: true });
  const listRequests = filterRowsByDay(visibleRequests, normalizedDay);

  const calendarBlocks = await listFerieCalendarBlocksForMonth(
    monthStartYmd(monthContextBase.yearMonth),
    monthEndYmd(monthContextBase.yearMonth),
  );

  const canCreate = profile.role === "specializzando";
  const listTitle =
    profile.role === "specializzando" ? "Le mie richieste" : "Richieste ferie";
  const listDescription =
    profile.role === "specializzando"
      ? "Tutte le tue richieste (in attesa, approvate, rifiutate, annullate), indipendentemente dal mese del calendario."
      : "Tutte le richieste visibili al tuo ruolo. Le in attesa possono essere approvate o rifiutate.";

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
              existingLeaves={visibleRequests.map((row) => ({
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
          calendarRows={calendarRequests}
          calendarBlocks={calendarBlocks}
        />
      </section>

      <section id="leave-requests-list">
        <Card title={listTitle} description={listDescription}>
          {normalizedDay ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Filtro giorno dal calendario: <strong>{format(toLocalDateFromYmd(normalizedDay), "dd/MM/yyyy", { locale: it })}</strong>
              {" "}
              <a href={`/ferie?month=${monthContextBase.yearMonth}`} className="underline hover:text-foreground">
                Mostra tutte
              </a>
            </p>
          ) : null}

          {listRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {normalizedDay
                ? "Nessuna richiesta per il giorno selezionato."
                : canCreate
                  ? "Nessuna richiesta ancora. Usa il modulo sopra per inviarne una."
                  : "Nessuna richiesta da visualizzare."}
            </p>
          ) : (
            <LeaveRequestsList
              rows={listRequests}
              overlapRows={visibleRequests}
              profileId={profile.id}
              profileRole={profile.role}
              month={monthContextBase.yearMonth}
              day={normalizedDay}
            />
          )}
        </Card>
      </section>
    </div>
  );
}
