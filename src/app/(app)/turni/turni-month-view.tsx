"use client";

import { addMonths, endOfMonth, format, parse, parseISO, startOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useId, useMemo, useState } from "react";

import { groupAssigneesByClinicalAreaHint } from "@/lib/domain/shift-assignee-area-hint";

import {
  addPlanningSlotAction,
  type AddPlanningSlotState,
  deletePlanningSlotAction,
  type DeletePlanningSlotState,
  updatePlanningSlotClinicalAreaAction,
  type UpdatePlanningSlotClinicalAreaState,
  updatePlanningSlotAssignmentLocationAction,
  type UpdatePlanningSlotAssignmentLocationState,
  assignShiftItemAction,
  submitMonthlyPlanAction,
  approveMonthlyPlanAction,
  reopenMonthlyPlanAction,
  publishMonthlyShiftsPlanAction,
} from "@/app/(app)/turni/monthly-plan-actions";
import { buildUserLoadLines, canEditAssignmentsByPlanAndRole, computeLoadWarnings } from "@/lib/domain/shift-rules";
import type { PlanningBlockInput, PlanningLeaveRangeInput } from "@/lib/domain/planning-assistential-conflicts";
import { buildPlanningAssistentialConflicts } from "@/lib/domain/planning-assistential-conflicts";
import type { TraineeLocationCompetencyInput } from "@/lib/domain/trainee-competency-assignment-hint";
import {
  competencySelectOptionMeta,
  evaluateShiftAssignmentCompetencyHint,
} from "@/lib/domain/trainee-competency-assignment-hint";
import {
  buildTraineeWeeklyPlanningSummaries,
  collectTraineeWeeklySummaryUserIds,
} from "@/lib/domain/trainee-weekly-planning-summary";
import {
  buildMonthlyTraineeShiftStatistics,
  collectTraineeIdsWithAssignmentsInMonth,
} from "@/lib/domain/monthly-trainee-shift-statistics";
import {
  buildWeeklyAssistentialLoads,
  formatWeekRangeItalian,
  userIdsWithAnyWeeklyAssistentialExcess,
  WEEKLY_ASSISTENTIAL_CAP_HOURS,
} from "@/lib/domain/weekly-assistential-hours";
import {
  addTraineePlanningBlockAction,
  type AddTraineePlanningBlockState,
} from "@/app/(app)/turni/trainee-planning-block-actions";
import { TraineeWeeklySummaryPanel } from "@/app/(app)/turni/trainee-weekly-summary-panel";
import type { MonthlyShiftPlanRow, ShiftItemRow } from "@/lib/domain/monthly-shifts";
import type { PlanningChangeLogRow } from "@/lib/data/planning-change-log";
import {
  isMonthlyShiftsPublished,
  monthlyShiftPlanStatusLabelItalian,
  shiftItemKindLabelItalian,
  shiftItemPeriodLabelItalian,
  shiftItemSourceLabelItalian,
} from "@/lib/domain/monthly-shifts";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";
import type { AssignableShiftUserOption } from "@/lib/data/shifts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

type ViewFilter = { kind: "all" } | { kind: "me" } | { kind: "user"; id: string };

function groupByDay(items: ShiftItemRow[]): [string, ShiftItemRow[]][] {
  const map = new Map<string, ShiftItemRow[]>();
  for (const item of items) {
    const d = item.shift_date;
    if (!map.has(d)) {
      map.set(d, []);
    }
    map.get(d)!.push(item);
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

function splitByBlock(items: ShiftItemRow[]) {
  return {
    mattina: items.filter((i) => i.kind === "sala" && i.period === "mattina"),
    pomeriggio: items.filter((i) => i.kind === "sala" && i.period === "pomeriggio"),
    ambulatorio: items.filter((i) => i.kind === "ambulatorio"),
    reperibilita: items.filter((i) => i.kind === "reperibilita"),
  };
}

function countAssigned(rows: ShiftItemRow[]) {
  const t = rows.length;
  const a = rows.filter((i) => i.assigned_to).length;
  return { a, t };
}

type SalaAddOption = {
  key: string;
  name: string;
  specialty: string;
  roomName: string | null;
  clinicalAreaId: string;
  source: "planning";
};

type PlanningAssignmentLocationOption = { id: string; name: string };

function AddPlanningSalaSlotRow({
  planId,
  shiftDate,
  period,
  yearMonth,
  locations,
  assignmentLocations,
}: {
  planId: string;
  shiftDate: string;
  period: "mattina" | "pomeriggio";
  yearMonth: string;
  locations: SalaAddOption[];
  assignmentLocations: PlanningAssignmentLocationOption[];
}) {
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [slotState, formAction, isPending] = useActionState<AddPlanningSlotState | null, FormData>(
    addPlanningSlotAction,
    null,
  );

  const btnLabel =
    period === "mattina" ? "Aggiungi sala al mattino" : "Aggiungi sala al pomeriggio";

  useEffect(() => {
    if (slotState?.ok) {
      setSelectedOptionKey("");
      setSelectedAssignmentId("");
    }
  }, [slotState?.ok]);

  if (locations.length === 0) {
    return (
      <p className="mt-2 text-[0.7rem] text-muted-foreground">
        Nessuna area sala attiva: configurale in Admin → Aree turni.
      </p>
    );
  }

  if (assignmentLocations.length === 0) {
    return (
      <p className="mt-2 text-[0.7rem] text-muted-foreground">
        Nessuna sala o attività configurata in database. Esegui la migrazione che crea `assignment_locations` (seed
        iniziale).
      </p>
    );
  }

  const selectedAreaId = locations.find((o) => o.key === selectedOptionKey)?.clinicalAreaId ?? "";

  return (
    <form action={formAction} className="mt-2 space-y-1 border-t border-dashed border-border/80 pt-2">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="date" value={shiftDate} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="month" value={yearMonth} />
      <input type="hidden" name="clinicalAreaId" value={selectedAreaId} />
      <input type="hidden" name="assignmentLocationId" value={selectedAssignmentId} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`add-sala-${shiftDate}-${period}`}>
          Area sala
        </label>
        <select
          id={`add-sala-${shiftDate}-${period}`}
          className="h-8 min-w-[12rem] max-w-full rounded-md border border-input bg-card px-2 text-xs"
          value={selectedOptionKey}
          onChange={(e) => setSelectedOptionKey(e.target.value)}
        >
          <option value="">Area tipo turno…</option>
          {locations.map((loc) => (
            <option key={loc.key} value={loc.key}>
              {loc.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`add-sala-loc-${shiftDate}-${period}`}>
          Sala o attività
        </label>
        <select
          id={`add-sala-loc-${shiftDate}-${period}`}
          className="h-8 min-w-[10rem] max-w-full rounded-md border border-input bg-card px-2 text-xs"
          value={selectedAssignmentId}
          onChange={(e) => setSelectedAssignmentId(e.target.value)}
        >
          <option value="">Sala / attività…</option>
          {assignmentLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!selectedOptionKey || !selectedAssignmentId || isPending}
        >
          {isPending ? "Salvataggio..." : btnLabel}
        </Button>
      </div>
      {slotState?.ok ? <p className="text-[0.7rem] text-emerald-700">Slot aggiunto correttamente.</p> : null}
      {!slotState?.ok && slotState?.error ? <p className="text-[0.7rem] text-rose-700">{slotState.error}</p> : null}
    </form>
  );
}

function DeletePlanningSalaSlotForm({
  shiftItemId,
  planId,
  yearMonth,
}: {
  shiftItemId: string;
  planId: string;
  yearMonth: string;
}) {
  const router = useRouter();
  const [slotState, formAction, isPending] = useActionState<DeletePlanningSlotState | null, FormData>(
    deletePlanningSlotAction,
    null,
  );

  useEffect(() => {
    if (slotState?.ok) {
      router.refresh();
    }
  }, [slotState?.ok, router]);

  return (
    <form action={formAction} className="mt-1 flex flex-col gap-1">
      <input type="hidden" name="shiftItemId" value={shiftItemId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="month" value={yearMonth} />
      <Button type="submit" variant="outline" size="sm" className="h-7 w-fit text-xs text-rose-800 dark:text-rose-300" disabled={isPending}>
        {isPending ? "Eliminazione..." : "Elimina sala"}
      </Button>
      {slotState?.ok ? (
        <p className="text-[0.7rem] text-emerald-700" role="status">
          Sala rimossa dal planning.
        </p>
      ) : null}
      {slotState && !slotState.ok ? (
        <p className="text-[0.7rem] text-rose-700" role="alert">
          {slotState.error}
        </p>
      ) : null}
    </form>
  );
}

function UpdatePlanningSalaClinicalAreaRow({
  shiftItemId,
  planId,
  yearMonth,
  areas,
  currentClinicalAreaId,
}: {
  shiftItemId: string;
  planId: string;
  yearMonth: string;
  areas: SalaAddOption[];
  currentClinicalAreaId: string | null;
}) {
  const selectedInitial =
    currentClinicalAreaId && areas.some((a) => a.clinicalAreaId === currentClinicalAreaId)
      ? currentClinicalAreaId
      : "";
  const [selected, setSelected] = useState(selectedInitial);
  const [areaState, areaAction, areaPending] = useActionState<
    UpdatePlanningSlotClinicalAreaState | null,
    FormData
  >(updatePlanningSlotClinicalAreaAction, null);

  useEffect(() => {
    const next =
      currentClinicalAreaId && areas.some((a) => a.clinicalAreaId === currentClinicalAreaId)
        ? currentClinicalAreaId
        : "";
    setSelected(next);
  }, [currentClinicalAreaId, areas]);

  return (
    <form action={areaAction} className="mt-1 flex flex-wrap items-end gap-2 border-t border-dashed border-border/60 pt-2">
      <input type="hidden" name="shiftItemId" value={shiftItemId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="month" value={yearMonth} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Area turno</span>
        <select
          name="clinicalAreaId"
          required
          className="h-8 w-full min-w-[10rem] max-w-full rounded-md border border-input bg-card px-2 text-xs"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Scegli area…</option>
          {areas.map((a) => (
            <option key={a.clinicalAreaId} value={a.clinicalAreaId}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" size="sm" className="h-8 shrink-0 text-xs" disabled={areaPending || !selected}>
        {areaPending ? "…" : "Aggiorna area"}
      </Button>
      {areaState && !areaState.ok ? (
        <p className="w-full text-[0.65rem] text-rose-700">{areaState.error}</p>
      ) : null}
    </form>
  );
}

function UpdatePlanningSalaAssignmentLocationRow({
  shiftItemId,
  planId,
  yearMonth,
  locations,
  currentAssignmentLocationId,
}: {
  shiftItemId: string;
  planId: string;
  yearMonth: string;
  locations: PlanningAssignmentLocationOption[];
  currentAssignmentLocationId: string | null;
}) {
  const selectedInitial =
    currentAssignmentLocationId && locations.some((a) => a.id === currentAssignmentLocationId)
      ? currentAssignmentLocationId
      : "";
  const [selected, setSelected] = useState(selectedInitial);
  const [locState, locAction, locPending] = useActionState<
    UpdatePlanningSlotAssignmentLocationState | null,
    FormData
  >(updatePlanningSlotAssignmentLocationAction, null);

  useEffect(() => {
    const next =
      currentAssignmentLocationId && locations.some((a) => a.id === currentAssignmentLocationId)
        ? currentAssignmentLocationId
        : "";
    setSelected(next);
  }, [currentAssignmentLocationId, locations]);

  if (locations.length === 0) return null;

  return (
    <form action={locAction} className="mt-1 flex flex-wrap items-end gap-2 border-t border-dashed border-border/60 pt-2">
      <input type="hidden" name="shiftItemId" value={shiftItemId} />
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="month" value={yearMonth} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">Sala / attività</span>
        <select
          name="assignmentLocationId"
          required
          className="h-8 w-full min-w-[10rem] max-w-full rounded-md border border-input bg-card px-2 text-xs"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Scegli…</option>
          {locations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" size="sm" className="h-8 shrink-0 text-xs" disabled={locPending || !selected}>
        {locPending ? "…" : "Aggiorna sala"}
      </Button>
      {locState && !locState.ok ? (
        <p className="w-full text-[0.65rem] text-rose-700">{locState.error}</p>
      ) : null}
    </form>
  );
}

type AssigneeOption = AssignableShiftUserOption;

function personLabel(people: AssigneeOption[], id: string | null) {
  if (!id) return "—";
  const p = people.find((u) => u.id === id);
  if (!p) return "—";
  return p.list_label.trim() || p.full_name?.trim() || p.email?.trim() || p.id;
}

function formatAuditDateTime(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return format(d, "dd/MM/yyyy HH:mm");
}

type TurniMonthViewProps = {
  yearMonth: string;
  plan: MonthlyShiftPlanRow;
  items: ShiftItemRow[];
  currentUserId: string;
  currentUserRole: "specializzando" | "tutor" | "admin";
  assigneeOptions: AssigneeOption[];
  changeLogs: PlanningChangeLogRow[];
  /** Opzioni sala merge planning+anagrafica per aggiunta slot. */
  salaLocationOptions?: SalaAddOption[];
  /** Catalogo sale / attività (`assignment_locations`). */
  assignmentLocationOptions?: PlanningAssignmentLocationOption[];
  planningLeaves: PlanningLeaveRangeInput[];
  planningBlocks: PlanningBlockInput[];
  traineeCompetencyRows: TraineeLocationCompetencyInput[];
  /** Specializzando con piano non pubblicato: niente griglia, solo messaggio + blocchi didattica se ammessi dallo stato. */
  specializzandoPrepublishMode?: boolean;
};

function TurniItemRow({
  item,
  assigneeOptions,
  canEdit,
  assignReadOnlyTitle,
  isSaving,
  showSaved,
  inlineError,
  isConflictHighlight,
  onAssign,
  deleteSalaPlanning,
  salaAreaSelectOptions,
  assignmentLocationSelectOptions,
  weeklyExcessUserIds,
  planningConflictMessages,
  traineeCompetencyRows,
}: {
  item: ShiftItemRow;
  assigneeOptions: AssigneeOption[];
  canEdit: boolean;
  /** Se non `canEdit`, tooltip/aria su select o testo. */
  assignReadOnlyTitle: string;
  isSaving: boolean;
  showSaved: boolean;
  inlineError?: string | null;
  /** Riga in conflitto con l’ultimo tentativo (stessa persona, stessa data). */
  isConflictHighlight?: boolean;
  onAssign: (userId: string | null) => void;
  /** Admin + piano in bozza: elimina slot sala (solo righe kind sala). */
  deleteSalaPlanning?: { planId: string; yearMonth: string } | null;
  /** Aree attive per cambio area su slot sala (solo bozza). */
  salaAreaSelectOptions?: SalaAddOption[];
  /** Sale attive per cambio assegnazione su slot sala (solo bozza). */
  assignmentLocationSelectOptions?: PlanningAssignmentLocationOption[];
  /** Assegnatario con almeno una settimana oltre il limite ore (sui dati del mese). */
  weeklyExcessUserIds: Set<string>;
  planningConflictMessages: string[];
  traineeCompetencyRows: TraineeLocationCompetencyInput[];
}) {
  const hasAssignee = Boolean(item.assigned_to);
  const weeklyCapForAssignee = Boolean(item.assigned_to && weeklyExcessUserIds.has(item.assigned_to));
  const titleWhenReadOnly = assignReadOnlyTitle;
  const shiftAreaCode = item.kind === "sala" ? item.clinical_area?.code ?? null : null;
  const assigneeGroups = useMemo(
    () => groupAssigneesByClinicalAreaHint(assigneeOptions, shiftAreaCode),
    [assigneeOptions, shiftAreaCode],
  );
  const shiftDay = item.shift_date.trim().slice(0, 10);
  const assigneeOptionLabel = (u: AssigneeOption) =>
    u.list_label.trim() || u.full_name?.trim() || u.email?.trim() || u.id;
  const assigneeOptionElement = (u: AssigneeOption) => {
    const label = assigneeOptionLabel(u);
    const meta = competencySelectOptionMeta(traineeCompetencyRows, u.id, shiftDay, item);
    return (
      <option
        key={u.id}
        value={u.id}
        title={meta.optionTitle ? `${label} — ${meta.optionTitle}` : undefined}
      >
        {label}
        {meta.suffix}
      </option>
    );
  };
  const assignedProfile = item.assigned_to ? assigneeOptions.find((u) => u.id === item.assigned_to) : undefined;
  const assignmentCoherenceHint =
    hasAssignee && item.assigned_to && (item.kind === "sala" || item.kind === "ambulatorio")
      ? evaluateShiftAssignmentCompetencyHint({
          traineeId: item.assigned_to,
          shiftDateYmd: shiftDay,
          item,
          competencyRows: traineeCompetencyRows,
        })
      : null;
  const assigneeMatchesAreaHint =
    Boolean(shiftAreaCode) && assignedProfile?.assegnazione === shiftAreaCode;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
        isConflictHighlight &&
          "ring-1 ring-rose-400/70 dark:ring-rose-600/50",
        isConflictHighlight && (hasAssignee
          ? "border-rose-200/80 bg-rose-50/90 dark:border-rose-800/50 dark:bg-rose-950/30"
          : "border-rose-300/90 bg-rose-100/50 dark:border-rose-800/50 dark:bg-rose-950/20"),
        !isConflictHighlight && hasAssignee
          ? "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-800/50 dark:bg-emerald-950/30"
          : null,
        !isConflictHighlight && !hasAssignee
          ? "border-rose-200/90 bg-rose-50/50 dark:border-rose-800/50 dark:bg-rose-950/20"
          : null,
        isSaving && "opacity-70",
        weeklyCapForAssignee && !isConflictHighlight && "ring-1 ring-amber-400/55 dark:ring-amber-600/50",
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div
          className={cn(
            "text-foreground",
            item.kind === "reperibilita" && "font-semibold text-violet-900 dark:text-violet-200",
          )}
        >
          {item.kind === "reperibilita" ? (
            <>Reperibilità · {shiftItemPeriodLabelItalian(item.period)}</>
          ) : item.kind === "ambulatorio" ? (
            <>
              {shiftItemPeriodLabelItalian(item.period)} ·{" "}
              <span className="font-medium">{item.assignment_location?.name ?? item.label}</span>
            </>
          ) : (
            <>
              {shiftItemPeriodLabelItalian(item.period)} ·{" "}
              <span className="font-medium">
                {item.assignment_location?.name ?? item.room_name ?? "—"}
              </span>
            </>
          )}
        </div>
        {item.kind === "sala" && (item.clinical_area || item.room_name || item.specialty) ? (
          <p className="text-xs text-muted-foreground">
            {item.clinical_area ? (
              <>
                <span className="font-medium text-foreground/90">Area tipo: {item.clinical_area.name}</span>
                <span className="text-muted-foreground"> ({item.clinical_area.code})</span>
                {!item.clinical_area.is_active ? (
                  <span className="ml-1 rounded bg-muted px-1 text-[0.65rem] uppercase tracking-wide">storico</span>
                ) : null}
              </>
            ) : (
              <>
                {item.specialty}
                {item.room_name ? <span className="ml-2">· {item.room_name}</span> : null}
              </>
            )}
          </p>
        ) : null}
        <p className="text-[0.7rem] uppercase text-muted-foreground/90">
          {shiftItemKindLabelItalian(item.kind)} · {shiftItemSourceLabelItalian(item.source)}
        </p>
        {isConflictHighlight ? (
          <p className="text-[0.7rem] text-rose-800 dark:text-rose-200/90" title="Vincolo stesso giorno / stessa persona">
            Già assegnato in questo giorno
          </p>
        ) : null}
        {weeklyCapForAssignee ? (
          <p className="text-[0.65rem] text-amber-950 dark:text-amber-100/90">
            Supera {WEEKLY_ASSISTENTIAL_CAP_HOURS}h assistenziali in almeno una settimana (lun–dom) contando solo i
            turni di questo mese: verifica le settimane a cavallo tra due mesi.
          </p>
        ) : null}
        {planningConflictMessages.length > 0 ? (
          <ul className="space-y-0.5 text-[0.65rem] text-orange-900 dark:text-orange-100/90">
            {planningConflictMessages.map((msg, idx) => (
              <li key={`${msg}-${idx}`}>{msg}</li>
            ))}
          </ul>
        ) : null}
        {assignmentCoherenceHint && assignmentCoherenceHint.message ? (
          <div
            className={cn(
              "rounded-md border px-2 py-1.5 text-[0.65rem]",
              assignmentCoherenceHint.severity === "warning" &&
                "border-amber-300/80 bg-amber-50/90 text-amber-950 dark:border-amber-800/50 dark:bg-amber-950/25 dark:text-amber-50",
              assignmentCoherenceHint.severity === "positive" &&
                "border-emerald-300/80 bg-emerald-50/90 text-emerald-950 dark:border-emerald-800/50 dark:bg-emerald-950/25 dark:text-emerald-50",
              assignmentCoherenceHint.severity === "neutral" &&
                "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <p className="font-medium text-foreground/90">Coerenza assegnazione</p>
            {assignmentCoherenceHint.shortLabel ? (
              <p className="mt-0.5 text-[0.6rem] uppercase tracking-wide text-foreground/80">
                {assignmentCoherenceHint.shortLabel}
              </p>
            ) : null}
            <p className="mt-0.5">{assignmentCoherenceHint.message}</p>
          </div>
        ) : null}
        {item.kind === "sala" && assignmentLocationSelectOptions && assignmentLocationSelectOptions.length > 0 && deleteSalaPlanning ? (
          <UpdatePlanningSalaAssignmentLocationRow
            shiftItemId={item.id}
            planId={deleteSalaPlanning.planId}
            yearMonth={deleteSalaPlanning.yearMonth}
            locations={assignmentLocationSelectOptions}
            currentAssignmentLocationId={item.assignment_location_id}
          />
        ) : null}
        {item.kind === "sala" && salaAreaSelectOptions && salaAreaSelectOptions.length > 0 && deleteSalaPlanning ? (
          <UpdatePlanningSalaClinicalAreaRow
            shiftItemId={item.id}
            planId={deleteSalaPlanning.planId}
            yearMonth={deleteSalaPlanning.yearMonth}
            areas={salaAreaSelectOptions}
            currentClinicalAreaId={item.clinical_area_id}
          />
        ) : null}
        {item.kind === "sala" && deleteSalaPlanning ? (
          <DeletePlanningSalaSlotForm
            shiftItemId={item.id}
            planId={deleteSalaPlanning.planId}
            yearMonth={deleteSalaPlanning.yearMonth}
          />
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <div className="flex items-center gap-2">
        {canEdit ? (
          <select
            className="h-9 min-w-[10.5rem] max-w-[min(100vw-2rem,22rem)] rounded-md border border-input bg-card px-2 text-sm"
            title={
              assigneeGroups.useGroupedSelect
                ? "Salvataggio al cambio. In alto: specializzandi la cui area formativa abituale coincide con il tipo di sala di questo slot (suggerimento, non obbligo)."
                : "Salvasubito al cambio"
            }
            disabled={isSaving}
            value={item.assigned_to ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              onAssign(next === "" ? null : next);
            }}
          >
            <option value="">—</option>
            {assigneeGroups.useGroupedSelect ? (
              <>
                <optgroup label="Suggeriti · area formativa come questo turno">
                  {assigneeGroups.suggested.map((u) => assigneeOptionElement(u))}
                </optgroup>
                {assigneeGroups.others.length > 0 ? (
                  <optgroup label="Altri specializzandi">
                    {assigneeGroups.others.map((u) => assigneeOptionElement(u))}
                  </optgroup>
                ) : null}
              </>
            ) : (
              assigneeGroups.others.map((u) => assigneeOptionElement(u))
            )}
          </select>
        ) : (
          <span
            className="text-sm text-muted-foreground"
            title={
              assigneeMatchesAreaHint
                ? `${titleWhenReadOnly} · Area formativa abituale allineata a questo turno.`
                : titleWhenReadOnly
            }
          >
            {personLabel(assigneeOptions, item.assigned_to)}
            {assigneeMatchesAreaHint ? (
              <span className="ml-1 text-xs text-emerald-700 dark:text-emerald-400" aria-hidden>
                ✓
              </span>
            ) : null}
            {assignmentCoherenceHint && assignmentCoherenceHint.shortLabel ? (
              <span
                className={cn(
                  "ml-1.5 rounded px-1 text-[0.6rem] font-medium",
                  assignmentCoherenceHint.severity === "warning" &&
                    "bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
                  assignmentCoherenceHint.severity === "positive" &&
                    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
                  assignmentCoherenceHint.severity === "neutral" &&
                    "bg-muted text-muted-foreground",
                )}
                title={assignmentCoherenceHint.message}
              >
                {assignmentCoherenceHint.shortLabel}
              </span>
            ) : null}
          </span>
        )}
        <span className="inline-flex w-6 justify-center text-base" aria-live="polite" aria-atomic>
          {isSaving ? <span title="Salvataggio…">⏳</span> : null}
          {!isSaving && showSaved ? <span title="Salvato">✓</span> : null}
        </span>
        </div>
        {inlineError ? <p className="max-w-[12rem] text-right text-xs text-rose-700 sm:max-w-xs">{inlineError}</p> : null}
      </div>
    </div>
  );
}

function BlockSection({
  title,
  timeHint,
  rows,
  canEdit,
  assignReadOnlyTitle,
  assigneeOptions,
  pendingId,
  lastSavedId,
  onAssignItem,
  empty,
  blockId,
  rowErrors,
  conflictItemIds,
  addSalaSlot,
  deleteSalaPlanning,
  salaAreaSelectOptions,
  assignmentLocationSelectOptions,
  weeklyExcessUserIds,
  shiftConflictMessages,
  traineeCompetencyRows,
}: {
  title: string;
  timeHint?: string;
  rows: ShiftItemRow[];
  canEdit: boolean;
  assignReadOnlyTitle: string;
  assigneeOptions: AssigneeOption[];
  pendingId: string | null;
  lastSavedId: string | null;
  onAssignItem: (itemId: string, userId: string | null) => void;
  empty: string;
  blockId: string;
  rowErrors: Record<string, string>;
  conflictItemIds: string[];
  weeklyExcessUserIds: Set<string>;
  shiftConflictMessages: Record<string, string[]>;
  addSalaSlot?: {
    planId: string;
    shiftDate: string;
    yearMonth: string;
    period: "mattina" | "pomeriggio";
    locations: SalaAddOption[];
    assignmentLocations: PlanningAssignmentLocationOption[];
  } | null;
  deleteSalaPlanning?: { planId: string; yearMonth: string } | null;
  salaAreaSelectOptions?: SalaAddOption[];
  assignmentLocationSelectOptions?: PlanningAssignmentLocationOption[];
  traineeCompetencyRows: TraineeLocationCompetencyInput[];
}) {
  const conflictSet = useMemo(() => new Set(conflictItemIds), [conflictItemIds]);
  const h = useId();
  const { a, t } = countAssigned(rows);
  return (
    <div className="space-y-2" aria-labelledby={h}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h4 id={h} className="text-sm font-semibold text-foreground">
            {title}
          </h4>
          {timeHint ? <span className="text-xs text-muted-foreground">({timeHint})</span> : null}
        </div>
        {t > 0 ? (
          <span className="text-xs tabular-nums text-muted-foreground" aria-label={`Assegnati: ${a} su ${t}`}>
            {a}/{t} assegnati
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground" id={blockId}>
          {empty}
        </p>
      ) : (
        <div className="space-y-1.5" aria-describedby={h}>
          {rows.map((item) => (
            <TurniItemRow
              key={item.id}
              item={item}
              assigneeOptions={assigneeOptions}
              canEdit={canEdit}
              assignReadOnlyTitle={assignReadOnlyTitle}
              isSaving={pendingId === item.id}
              showSaved={lastSavedId === item.id}
              inlineError={rowErrors[item.id] ?? null}
              isConflictHighlight={conflictSet.has(item.id)}
              onAssign={(userId) => onAssignItem(item.id, userId)}
              deleteSalaPlanning={deleteSalaPlanning}
              salaAreaSelectOptions={salaAreaSelectOptions}
              assignmentLocationSelectOptions={assignmentLocationSelectOptions}
              weeklyExcessUserIds={weeklyExcessUserIds}
              planningConflictMessages={shiftConflictMessages[item.id] ?? []}
              traineeCompetencyRows={traineeCompetencyRows}
            />
          ))}
        </div>
      )}
      {addSalaSlot ? (
        <AddPlanningSalaSlotRow
          planId={addSalaSlot.planId}
          shiftDate={addSalaSlot.shiftDate}
          period={addSalaSlot.period}
          yearMonth={addSalaSlot.yearMonth}
          locations={addSalaSlot.locations}
          assignmentLocations={addSalaSlot.assignmentLocations}
        />
      ) : null}
    </div>
  );
}

function DayCard({
  date,
  items,
  canEdit,
  assignReadOnlyTitle,
  assigneeOptions,
  pendingId,
  lastSavedId,
  onAssignItem,
  rowErrors,
  conflictItemIds,
  salaPlanningAdd,
  salaDeletePlanning,
  salaAreaSelectOptions,
  assignmentLocationSelectOptions,
  weeklyExcessUserIds,
  shiftConflictMessages,
  traineeCompetencyRows,
}: {
  date: string;
  items: ShiftItemRow[];
  canEdit: boolean;
  assignReadOnlyTitle: string;
  assigneeOptions: AssigneeOption[];
  pendingId: string | null;
  lastSavedId: string | null;
  onAssignItem: (itemId: string, userId: string | null) => void;
  rowErrors: Record<string, string>;
  conflictItemIds: string[];
  weeklyExcessUserIds: Set<string>;
  shiftConflictMessages: Record<string, string[]>;
  /** Aggiungi slot sala (admin): mattina/pomeriggio dall’anagrafica sale. */
  salaPlanningAdd?: {
    planId: string;
    yearMonth: string;
    locations: SalaAddOption[];
    assignmentLocations: PlanningAssignmentLocationOption[];
  } | null;
  salaDeletePlanning?: { planId: string; yearMonth: string } | null;
  salaAreaSelectOptions?: SalaAddOption[];
  assignmentLocationSelectOptions?: PlanningAssignmentLocationOption[];
  traineeCompetencyRows: TraineeLocationCompetencyInput[];
}) {
  const g = splitByBlock(items);
  const addMattina = salaPlanningAdd
    ? {
        planId: salaPlanningAdd.planId,
        yearMonth: salaPlanningAdd.yearMonth,
        shiftDate: date,
        period: "mattina" as const,
        locations: salaPlanningAdd.locations,
        assignmentLocations: salaPlanningAdd.assignmentLocations,
      }
    : null;
  const addPomeriggio = salaPlanningAdd
    ? {
        planId: salaPlanningAdd.planId,
        yearMonth: salaPlanningAdd.yearMonth,
        shiftDate: date,
        period: "pomeriggio" as const,
        locations: salaPlanningAdd.locations,
        assignmentLocations: salaPlanningAdd.assignmentLocations,
      }
    : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="border-b border-border/80 bg-card/95 px-4 py-3 sm:sticky sm:top-16 sm:z-[15] sm:shadow-sm sm:backdrop-blur-md">
        <h2 className="text-base font-semibold text-foreground">{formatDateItalian(date)}</h2>
      </header>
      <div className="space-y-4 px-4 pb-5 pt-4">
        <BlockSection
          title="Mattina"
          timeHint="08–14"
          rows={g.mattina}
          canEdit={canEdit}
          assignReadOnlyTitle={assignReadOnlyTitle}
          assigneeOptions={assigneeOptions}
          pendingId={pendingId}
          lastSavedId={lastSavedId}
          onAssignItem={onAssignItem}
          empty="Nessun turno in sala in mattinata."
          blockId={`${date}-mattina-empty`}
          rowErrors={rowErrors}
          conflictItemIds={conflictItemIds}
          weeklyExcessUserIds={weeklyExcessUserIds}
          shiftConflictMessages={shiftConflictMessages}
          addSalaSlot={addMattina}
          deleteSalaPlanning={salaDeletePlanning}
          salaAreaSelectOptions={salaAreaSelectOptions}
          assignmentLocationSelectOptions={assignmentLocationSelectOptions}
          traineeCompetencyRows={traineeCompetencyRows}
        />
        <BlockSection
          title="Pomeriggio"
          timeHint="14–20"
          rows={g.pomeriggio}
          canEdit={canEdit}
          assignReadOnlyTitle={assignReadOnlyTitle}
          assigneeOptions={assigneeOptions}
          pendingId={pendingId}
          lastSavedId={lastSavedId}
          onAssignItem={onAssignItem}
          empty="Nessun turno in sala in pomeriggio."
          blockId={`${date}-pom-empty`}
          rowErrors={rowErrors}
          conflictItemIds={conflictItemIds}
          weeklyExcessUserIds={weeklyExcessUserIds}
          shiftConflictMessages={shiftConflictMessages}
          addSalaSlot={addPomeriggio}
          deleteSalaPlanning={salaDeletePlanning}
          salaAreaSelectOptions={salaAreaSelectOptions}
          assignmentLocationSelectOptions={assignmentLocationSelectOptions}
          traineeCompetencyRows={traineeCompetencyRows}
        />
        <BlockSection
          title="Ambulatorio"
          timeHint="08–20"
          rows={g.ambulatorio}
          canEdit={canEdit}
          assignReadOnlyTitle={assignReadOnlyTitle}
          assigneeOptions={assigneeOptions}
          pendingId={pendingId}
          lastSavedId={lastSavedId}
          onAssignItem={onAssignItem}
          empty="Nessun blocco ambulatorio."
          blockId={`${date}-amb-empty`}
          rowErrors={rowErrors}
          conflictItemIds={conflictItemIds}
          weeklyExcessUserIds={weeklyExcessUserIds}
          shiftConflictMessages={shiftConflictMessages}
          deleteSalaPlanning={null}
          assignmentLocationSelectOptions={assignmentLocationSelectOptions}
          traineeCompetencyRows={traineeCompetencyRows}
        />
        <BlockSection
          title="Reperibilità"
          rows={g.reperibilita}
          canEdit={canEdit}
          assignReadOnlyTitle={assignReadOnlyTitle}
          assigneeOptions={assigneeOptions}
          pendingId={pendingId}
          lastSavedId={lastSavedId}
          onAssignItem={onAssignItem}
          empty="Nessun turno di reperibilità."
          blockId={`${date}-rep-empty`}
          rowErrors={rowErrors}
          conflictItemIds={conflictItemIds}
          weeklyExcessUserIds={weeklyExcessUserIds}
          shiftConflictMessages={shiftConflictMessages}
          deleteSalaPlanning={null}
          assignmentLocationSelectOptions={assignmentLocationSelectOptions}
          traineeCompetencyRows={traineeCompetencyRows}
        />
      </div>
    </section>
  );
}

function planStatusChipClass(status: MonthlyShiftPlanRow["status"]) {
  switch (status) {
    case "draft":
      return "bg-slate-200/80 text-slate-800 dark:bg-slate-700/80 dark:text-slate-100";
    case "submitted":
      return "bg-amber-200/80 text-amber-950 dark:bg-amber-900/50 dark:text-amber-100";
    case "approved":
      return "bg-emerald-200/80 text-emerald-950 dark:bg-emerald-900/40 dark:text-emerald-100";
    default:
      return "bg-muted text-foreground";
  }
}

function AddTraineePlanningBlockCard({
  yearMonth,
  planStatus,
  currentUserId,
  currentUserRole,
  assigneeOptions,
  monthStartStr,
  monthEndStr,
}: {
  yearMonth: string;
  planStatus: MonthlyShiftPlanRow["status"];
  currentUserId: string;
  currentUserRole: "specializzando" | "tutor" | "admin";
  assigneeOptions: AssigneeOption[];
  monthStartStr: string;
  monthEndStr: string;
}) {
  const [blockState, blockAction, blockPending] = useActionState<AddTraineePlanningBlockState | null, FormData>(
    addTraineePlanningBlockAction,
    null,
  );
  const [selectedUser, setSelectedUser] = useState(currentUserRole === "specializzando" ? currentUserId : "");

  useEffect(() => {
    if (blockState?.ok) {
      setSelectedUser(currentUserRole === "specializzando" ? currentUserId : "");
    }
  }, [blockState?.ok, currentUserId, currentUserRole]);

  if (planStatus === "approved") return null;
  if (currentUserRole !== "admin" && currentUserRole !== "specializzando") return null;

  return (
    <Card
      title="Blocchi didattica / congresso / desiderata (fascia)"
      description="Registra indisponibilità a mezza giornata o giornata intera. Le ferie e le desiderate su più giorni restano in Ferie; qui si integrano le lezioni pomeridiane, congressi, ecc."
    >
      <form action={blockAction} className="flex flex-col gap-2 text-sm">
        <input type="hidden" name="month" value={yearMonth} />
        {currentUserRole === "admin" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="tpb-user" className="text-xs font-medium text-muted-foreground">
              Specializzando
            </label>
            <select
              id="tpb-user"
              name="userId"
              required
              className="h-9 rounded-md border border-input bg-card px-2"
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
            >
              <option value="">Scegli…</option>
              {assigneeOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.list_label.trim() || u.full_name?.trim() || u.email?.trim() || u.id}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="userId" value={currentUserId} />
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="tpb-date" className="text-xs font-medium text-muted-foreground">
            Data
          </label>
          <input
            id="tpb-date"
            type="date"
            name="blockDate"
            required
            min={monthStartStr}
            max={monthEndStr}
            className="h-9 rounded-md border border-input bg-card px-2"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Fascia</span>
            <select name="period" required className="h-9 rounded-md border border-input bg-card px-2">
              <option value="morning">Mattina</option>
              <option value="afternoon">Pomeriggio</option>
              <option value="full_day">Tutto il giorno</option>
            </select>
          </div>
          <div className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
            <select name="kind" required className="h-9 rounded-md border border-input bg-card px-2">
              <option value="didattica">Didattica / lezione</option>
              <option value="congresso">Congresso</option>
              <option value="desiderata">Desiderata (fascia)</option>
              <option value="altro">Altro</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tpb-title" className="text-xs font-medium text-muted-foreground">
            Titolo
          </label>
          <input
            id="tpb-title"
            name="title"
            required
            placeholder="es. Lezione ECM, Congresso SIAARTI…"
            className="h-9 rounded-md border border-input bg-card px-2"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="sm"
          className="w-fit"
          disabled={blockPending || (currentUserRole === "admin" && !selectedUser)}
        >
          {blockPending ? "Salvataggio…" : "Registra blocco"}
        </Button>
        {blockState?.ok ? <p className="text-xs text-emerald-700">Blocco registrato.</p> : null}
        {blockState && !blockState.ok ? <p className="text-xs text-rose-700">{blockState.error}</p> : null}
      </form>
    </Card>
  );
}

export function TurniMonthView({
  yearMonth,
  plan,
  items,
  currentUserId,
  currentUserRole,
  assigneeOptions,
  changeLogs,
  salaLocationOptions,
  assignmentLocationOptions,
  planningLeaves,
  planningBlocks,
  traineeCompetencyRows,
  specializzandoPrepublishMode = false,
}: TurniMonthViewProps) {
  const router = useRouter();
  const [assignError, setAssignError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [conflictItemIds, setConflictItemIds] = useState<string[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [viewFilter, setViewFilter] = useState<ViewFilter>({ kind: "all" });

  const isAdmin = currentUserRole === "admin";
  const canEditAssignments = canEditAssignmentsByPlanAndRole(plan.status, currentUserRole);
  const planIsApproved = plan.status === "approved";

  /** Opzioni sale serializzate dal server: normalizza per evitare select vuoto se props sono null/non-array. */
  const salaLocationsForPlanning = useMemo(() => {
    const raw = salaLocationOptions;
    if (raw == null || !Array.isArray(raw)) return [] as SalaAddOption[];
    return raw.filter(
      (r): r is SalaAddOption =>
        r != null &&
        typeof r.key === "string" &&
        r.key.length > 0 &&
        typeof r.name === "string" &&
        typeof r.specialty === "string" &&
        r.specialty.length > 0 &&
        typeof r.clinicalAreaId === "string" &&
        r.clinicalAreaId.length > 0 &&
        (r.roomName === null || typeof r.roomName === "string"),
    );
  }, [salaLocationOptions]);

  const assignmentLocationsForPlanning = useMemo(() => {
    const raw = assignmentLocationOptions;
    if (raw == null || !Array.isArray(raw)) return [] as PlanningAssignmentLocationOption[];
    return raw.filter(
      (r): r is PlanningAssignmentLocationOption =>
        r != null && typeof r.id === "string" && r.id.length > 0 && typeof r.name === "string" && r.name.length > 0,
    );
  }, [assignmentLocationOptions]);

  const nameById = useCallback(
    (id: string) => {
      const o = assigneeOptions.find((u) => u.id === id);
      return o?.list_label.trim() || o?.full_name?.trim() || o?.email?.trim() || id;
    },
    [assigneeOptions],
  );
  const loadLines = useMemo(() => buildUserLoadLines(items, nameById), [items, nameById]);
  const loadWarnings = useMemo(() => computeLoadWarnings(loadLines), [loadLines]);
  const weeklyLoads = useMemo(() => buildWeeklyAssistentialLoads(items, nameById), [items, nameById]);
  const weeklyExcessUserIds = useMemo(() => userIdsWithAnyWeeklyAssistentialExcess(weeklyLoads), [weeklyLoads]);
  const weeklyExceededRows = useMemo(() => weeklyLoads.filter((w) => w.exceeded), [weeklyLoads]);

  const monthAnchor = useMemo(() => parse(yearMonth, "yyyy-MM", new Date()), [yearMonth]);
  const monthStartStr = useMemo(() => format(startOfMonth(monthAnchor), "yyyy-MM-dd"), [monthAnchor]);
  const monthEndStr = useMemo(() => format(endOfMonth(monthAnchor), "yyyy-MM-dd"), [monthAnchor]);

  const { planningAssistentialConflicts, shiftConflictMessages } = useMemo(() => {
    const rows = buildPlanningAssistentialConflicts({
      items,
      leaves: planningLeaves,
      blocks: planningBlocks,
      nameById,
    });
    const msgs: Record<string, string[]> = {};
    for (const r of rows) {
      if (!msgs[r.shiftItemId]) msgs[r.shiftItemId] = [];
      const list = msgs[r.shiftItemId]!;
      if (!list.includes(r.shortMessage)) list.push(r.shortMessage);
    }
    return { planningAssistentialConflicts: rows, shiftConflictMessages: msgs };
  }, [items, planningLeaves, planningBlocks, nameById]);

  const weeklyTraineeSummaries = useMemo(() => {
    const userIds = collectTraineeWeeklySummaryUserIds({
      items,
      leaves: planningLeaves,
      blocks: planningBlocks,
      preferredOrder: assigneeOptions.map((o) => o.id),
    });
    if (userIds.length === 0) return [];
    return buildTraineeWeeklyPlanningSummaries({
      items,
      leaves: planningLeaves,
      blocks: planningBlocks,
      conflicts: planningAssistentialConflicts,
      nameById,
      monthStart: monthStartStr,
      monthEnd: monthEndStr,
      userIds,
    });
  }, [
    items,
    planningLeaves,
    planningBlocks,
    planningAssistentialConflicts,
    nameById,
    monthStartStr,
    monthEndStr,
    assigneeOptions,
  ]);

  const monthlyTraineeStatistics = useMemo(() => {
    const assigneeIdsOrdered = assigneeOptions.map((o) => o.id);
    const userIds = collectTraineeIdsWithAssignmentsInMonth(
      items,
      monthStartStr,
      monthEndStr,
      assigneeIdsOrdered,
    );
    return buildMonthlyTraineeShiftStatistics({
      items,
      monthStart: monthStartStr,
      monthEnd: monthEndStr,
      conflicts: planningAssistentialConflicts,
      weeklyLoads,
      userIds,
      nameById,
    });
  }, [
    items,
    monthStartStr,
    monthEndStr,
    planningAssistentialConflicts,
    weeklyLoads,
    assigneeOptions,
    nameById,
  ]);

  const assignReadOnlyTitle = useMemo(() => {
    if (planIsApproved) {
      return "Mese approvato: le assegnazioni non sono modificabili";
    }
    if (currentUserRole === "tutor") {
      return "Sola consultazione (tutor): le assegnazioni le gestiscono gli amministratori in base allo stato del piano";
    }
    if (plan.status === "submitted" && currentUserRole === "specializzando") {
      return "Piano inviato: solo l’amministratore può modificare le assegnazioni";
    }
    return "Sola consultazione";
  }, [planIsApproved, currentUserRole, plan.status]);

  const filteredItems = useMemo(() => {
    if (viewFilter.kind === "all") return items;
    if (viewFilter.kind === "me") return items.filter((i) => i.assigned_to === currentUserId);
    return items.filter((i) => i.assigned_to === viewFilter.id);
  }, [items, viewFilter, currentUserId]);

  const days = useMemo(() => groupByDay(filteredItems), [filteredItems]);

  const dayAnchor = parse(yearMonth, "yyyy-MM", new Date());
  const prevM = format(subMonths(dayAnchor, 1), "yyyy-MM");
  const nextM = format(addMonths(dayAnchor, 1), "yyyy-MM");
  const monthLabel = format(dayAnchor, "LLLL yyyy", { locale: it });

  const { a: assignedCount, t: slotTotal } = useMemo(() => countAssigned(items), [items]);
  const assignmentCoverage = slotTotal > 0 ? assignedCount / slotTotal : 1;
  const showLowAssignmentWarning = slotTotal > 0 && assignmentCoverage < 0.7;

  const onAssignItem = useCallback(
    async (itemId: string, userId: string | null) => {
      setPendingId(itemId);
      setAssignError(null);
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setConflictItemIds([]);

      const res = await assignShiftItemAction({ shiftId: itemId, userId, month: yearMonth });
      setPendingId(null);
      if (!res.ok) {
        setRowErrors((prev) => ({ ...prev, [itemId]: res.error }));
        if (res.conflictItemIds && res.conflictItemIds.length > 0) {
          setConflictItemIds(res.conflictItemIds);
          setAssignError(null);
        } else {
          setAssignError(res.error);
        }
        return;
      }
      setRowErrors({});
      setConflictItemIds([]);
      setAssignError(null);
      setLastSavedId(itemId);
      window.setTimeout(() => {
        setLastSavedId((x) => (x === itemId ? null : x));
      }, 2000);
      router.refresh();
    },
    [yearMonth, router],
  );

  const userFilterValue = viewFilter.kind === "user" ? viewFilter.id : "";

  const salaPlanningAdd = useMemo(() => {
    if (!isAdmin || planIsApproved) return null;
    return {
      planId: plan.id,
      yearMonth,
      locations: [...salaLocationsForPlanning],
      assignmentLocations: [...assignmentLocationsForPlanning],
    };
  }, [isAdmin, planIsApproved, plan.id, yearMonth, salaLocationsForPlanning, assignmentLocationsForPlanning]);

  const salaDeletePlanning = useMemo(() => {
    if (!isAdmin || plan.status !== "draft") return null;
    return { planId: plan.id, yearMonth };
  }, [isAdmin, plan.id, plan.status, yearMonth]);

  if (specializzandoPrepublishMode && currentUserRole === "specializzando") {
    return (
      <div className="space-y-6">
        <div
          className={cn(
            "rounded-2xl border border-border bg-card px-4 py-3",
            plan.status === "draft" && "ring-1 ring-slate-300/40 dark:ring-slate-600/40",
            plan.status === "submitted" && "ring-1 ring-amber-300/50 dark:ring-amber-800/50",
            plan.status === "approved" && "ring-1 ring-emerald-300/50 dark:ring-emerald-800/50",
          )}
        >
          <div className="space-y-1">
            <p className="text-sm font-medium capitalize text-foreground">{monthLabel}</p>
            <p className="text-xs text-muted-foreground">Stato piano (sintesi)</p>
            <span
              className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", planStatusChipClass(plan.status))}
            >
              {monthlyShiftPlanStatusLabelItalian(plan.status)}
            </span>
          </div>
        </div>

        <div
          role="status"
          className="rounded-2xl border border-sky-200/90 bg-sky-50/90 px-4 py-3 text-sm text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/35 dark:text-sky-50"
        >
          <p className="font-medium">Planning del mese in preparazione</p>
          <p className="mt-1 text-xs text-sky-900/90 dark:text-sky-100/85">
            La griglia turni completa sarà visibile solo dopo la pubblicazione ufficiale al reparto. Puoi comunque
            registrare indisponibilità a fascia (sotto) e gestire ferie su più giorni dalla sezione dedicata.
          </p>
          <p className="mt-2 text-xs">
            <Link href="/ferie" className="font-medium text-primary underline-offset-2 hover:underline">
              Vai a Ferie e richieste
            </Link>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/turni?month=${prevM}`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            ← Mese precedente
          </Link>
          <Link
            href={`/turni?month=${nextM}`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Mese successivo →
          </Link>
        </div>

        <AddTraineePlanningBlockCard
          yearMonth={yearMonth}
          planStatus={plan.status}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          assigneeOptions={assigneeOptions}
          monthStartStr={monthStartStr}
          monthEndStr={monthEndStr}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "rounded-2xl border border-border bg-card px-4 py-3",
          plan.status === "draft" && "ring-1 ring-slate-300/40 dark:ring-slate-600/40",
          plan.status === "submitted" && "ring-1 ring-amber-300/50 dark:ring-amber-800/50",
          plan.status === "approved" && "ring-1 ring-emerald-300/50 dark:ring-emerald-800/50",
        )}
      >
        <div className="space-y-1">
          <p className="text-sm font-medium capitalize text-foreground">{monthLabel}</p>
          <p className="text-xs text-muted-foreground">Stato piano</p>
          <span
            className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-medium", planStatusChipClass(plan.status))}
          >
            {monthlyShiftPlanStatusLabelItalian(plan.status)}
          </span>
        </div>
      </div>

      {plan.status === "approved" ? (
        isMonthlyShiftsPublished(plan) ? (
          <div
            role="status"
            className="rounded-2xl border border-emerald-200/90 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-900/45 dark:bg-emerald-950/35 dark:text-emerald-50"
          >
            <p className="font-medium capitalize">Turni pubblicati per {monthLabel}</p>
            {plan.published_at ? (
              <p className="mt-1 text-xs text-emerald-900/90 dark:text-emerald-100/85">
                Data pubblicazione: {format(parseISO(plan.published_at), "dd/MM/yyyy HH:mm", { locale: it })}.
              </p>
            ) : null}
          </div>
        ) : isAdmin ? (
          <div
            role="status"
            className="rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50"
          >
            <p className="font-medium">Piano approvato ma turni non ancora pubblicati al reparto</p>
            <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-100/85">
              Usa «Pubblica turni» nelle azioni in fondo alla pagina per l’ufficializzazione ai specializzandi.
            </p>
          </div>
        ) : (
          <div
            role="status"
            className="rounded-2xl border border-slate-200/90 bg-slate-50/90 px-4 py-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-100"
          >
            <p className="font-medium">Piano in attesa di pubblicazione ufficiale</p>
            <p className="mt-1 text-xs text-slate-700 dark:text-slate-300/90">
              Il coordinamento ha approvato il mese; i turni saranno considerati pubblicati al reparto dopo l’azione
              dedicata dall’amministrazione.
            </p>
          </div>
        )
      ) : null}

      <div
        className={cn(
          "sticky top-0 z-20 rounded-xl border border-border bg-card/95 py-2.5 pl-3 pr-3 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-card/85",
        )}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
            <div className="flex shrink-0 items-center gap-1">
              <Link
                href={`/turni?month=${prevM}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent"
                aria-label="Mese precedente"
                title="Mese precedente"
              >
                ←
              </Link>
              <span className="hidden min-w-0 max-w-[11rem] truncate text-sm font-semibold capitalize text-foreground sm:inline sm:max-w-[14rem] md:max-w-none">
                {monthLabel}
              </span>
              <Link
                href={`/turni?month=${nextM}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-sm font-medium text-foreground transition-colors hover:bg-accent"
                aria-label="Mese successivo"
                title="Mese successivo"
              >
                →
              </Link>
            </div>
            <div className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden />
            <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">Mostra</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={viewFilter.kind === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewFilter({ kind: "all" })}
              >
                Tutti
              </Button>
              <Button
                type="button"
                variant={viewFilter.kind === "me" ? "default" : "outline"}
                size="sm"
                className="max-w-full"
                onClick={() => setViewFilter({ kind: "me" })}
                title="Mostra solo le righe di planning assegnate a te"
              >
                <span className="sm:hidden">Il mio planning</span>
                <span className="hidden sm:inline">Solo il mio planning</span>
              </Button>
              <div className="flex min-w-0 items-center gap-2">
                <label htmlFor="turni-filter-user" className="sr-only">
                  Filtra per collega
                </label>
                <select
                  id="turni-filter-user"
                  className="h-9 min-w-0 max-w-[min(100vw-8rem,18rem)] flex-1 rounded-md border border-input bg-card px-2 text-sm sm:min-w-[12rem] sm:max-w-none sm:flex-none"
                  value={userFilterValue}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setViewFilter({ kind: "all" });
                    } else {
                      setViewFilter({ kind: "user", id: v });
                    }
                  }}
                >
                  <option value="">Collega…</option>
                  {assigneeOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.list_label.trim() || u.full_name?.trim() || u.email?.trim() || u.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <p className="shrink-0 text-xs tabular-nums text-muted-foreground sm:text-right" aria-live="polite">
            {filteredItems.length}/{items.length} in vista
          </p>
        </div>
      </div>

      {assignError ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {assignError}
        </div>
      ) : null}

      {loadLines.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Carico assistenziale per assegnatario</p>
          <p className="text-xs text-muted-foreground">
            Conteggio su sala e ambulatorio; la reperibilità è indicata a parte e non somma ai turni qui sotto.
          </p>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1 text-foreground sm:columns-2 sm:gap-4">
            {loadLines.map((l) => {
              const parts = [
                l.mattine > 0 ? `${l.mattine} mattine` : null,
                l.pomeriggi > 0 ? `${l.pomeriggi} pomeriggi` : null,
                l.ambulatorio > 0 ? `${l.ambulatorio} ambulatorio` : null,
                l.reper > 0
                  ? `${l.reper} reper${l.weekendReper > 0 ? ` di cui ${l.weekendReper} in weekend` : ""}`
                  : null,
              ].filter(Boolean) as string[];
              return (
                <li key={l.userId} className="break-inside-avoid">
                  <span className="font-medium text-foreground">{l.displayName}</span>
                  <span className="text-muted-foreground"> — </span>
                  <span className="tabular-nums">{l.total} turni assistenziali</span>
                  {parts.length > 0 ? <span className="text-muted-foreground"> (</span> : null}
                  {parts.length > 0 ? <span>{parts.join(", ")}</span> : null}
                  {parts.length > 0 ? <span className="text-muted-foreground">)</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {weeklyLoads.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          {weeklyExceededRows.length > 0 ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-300/90 bg-rose-50 px-3 py-2 text-sm text-rose-950 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-50"
            >
              <p className="font-medium">Superamento {WEEKLY_ASSISTENTIAL_CAP_HOURS}h assistenziali in settimana</p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5">
                {weeklyExceededRows.map((w) => (
                  <li key={`${w.userId}-${w.weekStart}`}>
                    <span className="font-medium">{w.displayName}</span>
                    <span className="text-muted-foreground"> — </span>
                    {formatWeekRangeItalian(w.weekStart, w.weekEnd)}:{" "}
                    <span className="tabular-nums font-medium">{w.assistentialHours}h</span> su mezze giornate
                    assistenziali (reper esclusa).
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="font-medium text-foreground">Ore assistenziali per settimana (lun–dom)</p>
          <p className="text-xs text-muted-foreground">
            Ogni mezza giornata sala o ambulatorio vale 6h (giornata intera = 12h). Limite {WEEKLY_ASSISTENTIAL_CAP_HOURS}
            h: le reperibilità non contano. Se la settimana esce dal mese, il totale considera solo i turni caricati in
            questa vista.
          </p>
          <div className="max-h-64 overflow-auto rounded-md border border-border/80">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left font-medium">Settimana</th>
                  <th className="px-2 py-1.5 text-left font-medium">Collega</th>
                  <th className="px-2 py-1.5 text-right font-medium">Mezze gg.</th>
                  <th className="px-2 py-1.5 text-right font-medium">Ore</th>
                  <th className="px-2 py-1.5 text-right font-medium">Reper</th>
                  <th className="px-2 py-1.5 text-left font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {weeklyLoads.map((w) => (
                  <tr
                    key={`${w.userId}-${w.weekStart}`}
                    className={cn(
                      "border-b border-border/60",
                      w.exceeded && "bg-rose-50/80 dark:bg-rose-950/25",
                    )}
                  >
                    <td className="px-2 py-1.5 align-top whitespace-nowrap">
                      {formatWeekRangeItalian(w.weekStart, w.weekEnd)}
                    </td>
                    <td className="px-2 py-1.5 align-top">{w.displayName}</td>
                    <td className="px-2 py-1.5 align-top text-right tabular-nums">{w.assistentialHalfDays}</td>
                    <td className="px-2 py-1.5 align-top text-right tabular-nums">{w.assistentialHours}</td>
                    <td className="px-2 py-1.5 align-top text-right tabular-nums">{w.reperCount}</td>
                    <td className="px-2 py-1.5 align-top">
                      {w.exceeded ? (
                        <span className="font-medium text-rose-800 dark:text-rose-200">Oltre limite</span>
                      ) : (
                        <span className="text-muted-foreground">OK</span>
                      )}
                      {w.contributingShifts.length > 0 ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[0.65rem] text-primary">Turni che contano le ore</summary>
                          <ul className="mt-1 list-inside list-disc text-[0.65rem] text-muted-foreground">
                            {w.contributingShifts.map((c) => (
                              <li key={c.id}>{c.summary}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {planningAssistentialConflicts.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-orange-200/90 bg-orange-50/85 px-4 py-3 text-sm text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/35 dark:text-orange-50">
          <p className="font-medium">Conflitti turni assistenziali / indisponibilità</p>
          <p className="text-xs text-orange-900/90 dark:text-orange-100/85">
            Avviso non bloccante: ferie e desiderate su più giorni provengono da Ferie; lezioni e congressi a fascia da
            “Blocchi didattica…” sotto. Le reperibilità non generano conflitto in questo riepilogo.
          </p>
          <div className="max-h-56 overflow-auto rounded-md border border-orange-200/70 bg-card/90 dark:border-orange-800/40">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left font-medium">Data</th>
                  <th className="px-2 py-1.5 text-left font-medium">Specializzando</th>
                  <th className="px-2 py-1.5 text-left font-medium">Turno</th>
                  <th className="px-2 py-1.5 text-left font-medium">Sala / amb.</th>
                  <th className="px-2 py-1.5 text-left font-medium">Attività</th>
                  <th className="px-2 py-1.5 text-left font-medium">Fascia attività</th>
                  <th className="px-2 py-1.5 text-left font-medium">Messaggio</th>
                </tr>
              </thead>
              <tbody>
                {planningAssistentialConflicts.map((c, idx) => (
                  <tr
                    key={`${c.shiftItemId}-${c.shiftDate}-${c.activityKind}-${c.activityPeriodLabel}-${idx}`}
                    className="border-b border-border/60"
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateItalian(c.shiftDate)}</td>
                    <td className="px-2 py-1.5">{c.assigneeName}</td>
                    <td className="px-2 py-1.5">
                      {c.shiftKindLabel} · {c.shiftPeriodLabel}
                    </td>
                    <td className="px-2 py-1.5">{c.locationLabel}</td>
                    <td className="px-2 py-1.5">{c.activityKind}</td>
                    <td className="px-2 py-1.5">{c.activityPeriodLabel}</td>
                    <td className="px-2 py-1.5 font-medium text-orange-900 dark:text-orange-100">{c.shortMessage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <details className="group rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer list-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            Statistiche mensili per specializzando
            <span className="text-xs font-normal text-muted-foreground">
              Ore senza reper; weekend = sab/dom con assistenziale o reper; 36h settimanali (parziale ai bordi mese).
            </span>
          </span>
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Stessi contenuti del file Excel (stato piano, planning, statistiche, settimanale, conflitti).{" "}
            <a
              href={`/turni/monthly-plan-excel?month=${yearMonth}`}
              className="text-primary underline-offset-2 hover:underline"
            >
              Scarica .xlsx
            </a>
          </p>
          {monthlyTraineeStatistics.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nessuna assegnazione nel mese.</p>
          ) : (
            <div className="max-h-64 overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[760px] text-xs">
                <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1.5 text-left font-medium">Specializzando</th>
                    <th className="px-2 py-1.5 text-right font-medium">Ore</th>
                    <th className="px-2 py-1.5 text-right font-medium">½ gg</th>
                    <th className="px-2 py-1.5 text-right font-medium">Matt.</th>
                    <th className="px-2 py-1.5 text-right font-medium">Pome.</th>
                    <th className="px-2 py-1.5 text-right font-medium">Giorn.</th>
                    <th className="px-2 py-1.5 text-right font-medium">Reper</th>
                    <th className="px-2 py-1.5 text-right font-medium">WE</th>
                    <th className="px-2 py-1.5 text-right font-medium">Confl.</th>
                    <th className="px-2 py-1.5 text-right font-medium">&gt;36h</th>
                    <th className="px-2 py-1.5 text-left font-medium">Bordi</th>
                    <th className="px-2 py-1.5 text-left font-medium">Sale / amb.</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyTraineeStatistics.map((row) => (
                    <tr key={row.userId} className="border-b border-border/60">
                      <td className="px-2 py-1.5 font-medium text-foreground">{row.userName}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.assistentialHoursMonth}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.assistentialHalfDays}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.morningShifts}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.afternoonShifts}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.fullDayShifts}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.reperShifts}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.weekendDaysWorked}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.conflictsCount}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.weeksOver36HoursCount}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.hasPartialWeekAtMonthEdge ? "parziale" : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {row.locationHalfDays.length === 0
                          ? "—"
                          : row.locationHalfDays.map((l) => `${l.locationLabel}: ${l.halfDays}`).join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <TraineeWeeklySummaryPanel
        summaries={weeklyTraineeSummaries}
        monthStartStr={monthStartStr}
        monthEndStr={monthEndStr}
      />

      {loadWarnings.length > 0 ? (
        <div
          className="rounded-2xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          <p className="font-medium">⚠ Distribuzione da controllare</p>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-amber-900">
            {loadWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        {planIsApproved
          ? "Piano approvato: nessuna modifica alle assegnazioni."
          : currentUserRole === "tutor"
            ? "Ruolo tutor: sola consultazione."
            : plan.status === "submitted" && currentUserRole === "specializzando"
              ? "Piano inviato: le assegnazioni possono essere modificate solo da un amministratore."
              : "Ogni modifica al menu salva in automatico."}{" "}
        <span className="whitespace-nowrap">({filteredItems.length} voci in vista</span> su {items.length} totali)
      </p>

      <div className="space-y-4">
        {items.length > 0 && filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            Nessun turno corrisponde al filtro selezionato.
          </p>
        ) : days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna riga in questo mese per questo piano.</p>
        ) : (
          days.map(([date, dayItems]) => (
            <DayCard
              key={date}
              date={date}
              items={dayItems}
              canEdit={canEditAssignments}
              assignReadOnlyTitle={assignReadOnlyTitle}
              assigneeOptions={assigneeOptions}
              pendingId={pendingId}
              lastSavedId={lastSavedId}
              onAssignItem={onAssignItem}
              rowErrors={rowErrors}
              conflictItemIds={conflictItemIds}
              salaPlanningAdd={salaPlanningAdd}
              salaDeletePlanning={salaDeletePlanning}
              salaAreaSelectOptions={salaLocationsForPlanning}
              assignmentLocationSelectOptions={assignmentLocationsForPlanning}
              weeklyExcessUserIds={weeklyExcessUserIds}
              shiftConflictMessages={shiftConflictMessages}
              traineeCompetencyRows={traineeCompetencyRows}
            />
          ))
        )}
      </div>

      <AddTraineePlanningBlockCard
        yearMonth={yearMonth}
        planStatus={plan.status}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        assigneeOptions={assigneeOptions}
        monthStartStr={monthStartStr}
        monthEndStr={monthEndStr}
      />

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Azioni sul mese</p>
        {plan.status === "draft" && currentUserRole === "admin" ? (
          <form action={submitMonthlyPlanAction} className="space-y-2">
            <input type="hidden" name="planId" value={plan.id} />
            <input type="hidden" name="month" value={yearMonth} />
            {showLowAssignmentWarning ? (
              <p
                className="max-w-prose rounded-md border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100"
                role="status"
              >
                Sono assegnati meno del 70% dei turni in questo mese ({Math.round(assignmentCoverage * 100)}%, {assignedCount} su{" "}
                {slotTotal}). Verifica se è voluto prima di inviare: l’invio resta possibile.
              </p>
            ) : null}
            <div>
            <Button type="submit" variant="secondary" size="sm">
              Invia mese
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Segna il piano come inviato; le assegnazioni restano modificabili fino all’approvazione.
            </p>
            </div>
          </form>
        ) : null}
        {isAdmin && plan.status !== "approved" ? (
          <form action={approveMonthlyPlanAction} className="pt-1">
            <input type="hidden" name="planId" value={plan.id} />
            <input type="hidden" name="month" value={yearMonth} />
            <Button type="submit" className="bg-emerald-700 text-white hover:bg-emerald-800" size="sm">
              Approva mese
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Blocca le modifiche per tutti i turni del mese. Per comunicarli al reparto serve anche «Pubblica turni».
            </p>
          </form>
        ) : null}
        {isAdmin && plan.status === "approved" && !isMonthlyShiftsPublished(plan) ? (
          <form action={publishMonthlyShiftsPlanAction} className="pt-1">
            <input type="hidden" name="planId" value={plan.id} />
            <input type="hidden" name="month" value={yearMonth} />
            <Button type="submit" size="sm">
              Pubblica turni
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Ufficializza i turni al reparto (visibile ai specializzandi). Dopo «Riapri mese» andrà ripubblicato.
            </p>
          </form>
        ) : null}
        {isAdmin && plan.status === "approved" ? (
          <form action={reopenMonthlyPlanAction} className="pt-1">
            <input type="hidden" name="planId" value={plan.id} />
            <input type="hidden" name="month" value={yearMonth} />
            <Button type="submit" variant="outline" size="sm">
              Riapri mese
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Riporta il piano in bozza; annulla approvazione, pubblicazione e sblocca le assegnazioni.
            </p>
          </form>
        ) : null}
      </div>

      {isAdmin ? (
        <Card title="Storico modifiche" description="Audit trail del planning del mese (ultime modifiche).">
          {changeLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna modifica registrata per questo mese.</p>
          ) : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-1 text-left">Quando</th>
                    <th className="px-2 py-1 text-left">Azione</th>
                    <th className="px-2 py-1 text-left">Shift</th>
                    <th className="px-2 py-1 text-left">Dettagli</th>
                  </tr>
                </thead>
                <tbody>
                  {changeLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border/60">
                      <td className="px-2 py-1 whitespace-nowrap">{formatAuditDateTime(log.created_at)}</td>
                      <td className="px-2 py-1">{log.action}</td>
                      <td className="px-2 py-1 font-mono text-[11px]">{log.shift_id ?? "—"}</td>
                      <td className="px-2 py-1">
                        {log.after_data ? (
                          <span className="text-muted-foreground">
                            {(log.after_data.period as string | undefined) ?? ""}{" "}
                            {(log.after_data.room_name as string | undefined) ?? ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
