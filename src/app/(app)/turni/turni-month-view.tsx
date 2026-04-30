"use client";

import { addMonths, format, parse, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useState } from "react";

import {
  addPlanningSlotAction,
  assignShiftItemAction,
  submitMonthlyPlanAction,
  approveMonthlyPlanAction,
  reopenMonthlyPlanAction,
} from "@/app/(app)/turni/monthly-plan-actions";
import { buildUserLoadLines, canEditAssignmentsByPlanAndRole, computeLoadWarnings } from "@/lib/domain/shift-rules";
import type { MonthlyShiftPlanRow, ShiftItemRow } from "@/lib/domain/monthly-shifts";
import type { PlanningChangeLogRow } from "@/lib/data/planning-change-log";
import {
  monthlyShiftPlanStatusLabelItalian,
  shiftItemKindLabelItalian,
  shiftItemSourceLabelItalian,
} from "@/lib/domain/monthly-shifts";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";
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
  source: "planning";
};

function AddPlanningSalaSlotRow({
  planId,
  shiftDate,
  period,
  yearMonth,
  locations,
}: {
  planId: string;
  shiftDate: string;
  period: "mattina" | "pomeriggio";
  yearMonth: string;
  locations: SalaAddOption[];
}) {
  const [selectedOptionKey, setSelectedOptionKey] = useState("");

  const btnLabel =
    period === "mattina" ? "Aggiungi sala al mattino" : "Aggiungi sala al pomeriggio";

  if (locations.length === 0) {
    return (
      <p className="mt-2 text-[0.7rem] text-muted-foreground">
        Nessuna specialita sala trovata nel planning corrente.
      </p>
    );
  }

  return (
    <form action={addPlanningSlotAction} className="mt-2 space-y-1 border-t border-dashed border-border/80 pt-2">
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="date" value={shiftDate} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="month" value={yearMonth} />
      <input
        type="hidden"
        name="specialty"
        value={locations.find((o) => o.key === selectedOptionKey)?.specialty ?? ""}
      />
      <input
        type="hidden"
        name="roomName"
        value={locations.find((o) => o.key === selectedOptionKey)?.roomName ?? ""}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`add-sala-${shiftDate}-${period}`}>
          Sala
        </label>
        <select
          id={`add-sala-${shiftDate}-${period}`}
          className="h-8 min-w-[12rem] max-w-full rounded-md border border-input bg-card px-2 text-xs"
          value={selectedOptionKey}
          onChange={(e) => setSelectedOptionKey(e.target.value)}
        >
          <option value="">Sala da aggiungere…</option>
          {locations.map((loc) => (
            <option key={loc.key} value={loc.key}>
              {loc.name}
            </option>
          ))}
        </select>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={!selectedOptionKey}
        >
          {btnLabel}
        </Button>
      </div>
    </form>
  );
}

type AssigneeOption = { id: string; full_name: string | null; email: string | null };

function personLabel(people: AssigneeOption[], id: string | null) {
  if (!id) return "—";
  const p = people.find((u) => u.id === id);
  if (!p) return "—";
  return p.full_name?.trim() || p.email?.trim() || p.id;
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
}) {
  const hasAssignee = Boolean(item.assigned_to);
  const titleWhenReadOnly = assignReadOnlyTitle;

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
      )}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="text-foreground">{item.label}</div>
        {item.kind === "sala" && (item.room_name || item.specialty) ? (
          <p className="text-xs text-muted-foreground">
            {item.room_name && <span className="mr-2">Sala: {item.room_name}</span>}
            {item.specialty}
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
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <div className="flex items-center gap-2">
        {canEdit ? (
          <select
            className="h-9 min-w-[10.5rem] rounded-md border border-input bg-card px-2 text-sm"
            title={canEdit ? "Salvasubito al cambio" : titleWhenReadOnly}
            disabled={isSaving}
            value={item.assigned_to ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              onAssign(next === "" ? null : next);
            }}
          >
            <option value="">—</option>
            {assigneeOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name?.trim() || u.email?.trim() || u.id}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-sm text-muted-foreground" title={titleWhenReadOnly}>
            {personLabel(assigneeOptions, item.assigned_to)}
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
  addSalaSlot?: {
    planId: string;
    shiftDate: string;
    yearMonth: string;
    period: "mattina" | "pomeriggio";
    locations: SalaAddOption[];
  } | null;
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
  /** Aggiungi slot sala (admin): mattina/pomeriggio dall’anagrafica sale. */
  salaPlanningAdd?: { planId: string; yearMonth: string; locations: SalaAddOption[] } | null;
}) {
  const g = splitByBlock(items);
  const addMattina = salaPlanningAdd
    ? {
        planId: salaPlanningAdd.planId,
        yearMonth: salaPlanningAdd.yearMonth,
        shiftDate: date,
        period: "mattina" as const,
        locations: salaPlanningAdd.locations,
      }
    : null;
  const addPomeriggio = salaPlanningAdd
    ? {
        planId: salaPlanningAdd.planId,
        yearMonth: salaPlanningAdd.yearMonth,
        shiftDate: date,
        period: "pomeriggio" as const,
        locations: salaPlanningAdd.locations,
      }
    : null;

  return (
    <Card title={formatDateItalian(date)} className="p-0">
      <div className="mt-0 space-y-4">
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
          addSalaSlot={addMattina}
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
          addSalaSlot={addPomeriggio}
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
        />
      </div>
    </Card>
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

export function TurniMonthView({
  yearMonth,
  plan,
  items,
  currentUserId,
  currentUserRole,
  assigneeOptions,
  changeLogs,
  salaLocationOptions,
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
        (r.roomName === null || typeof r.roomName === "string"),
    );
  }, [salaLocationOptions]);

  const nameById = useCallback(
    (id: string) => {
      const o = assigneeOptions.find((u) => u.id === id);
      return o?.full_name?.trim() || o?.email?.trim() || id;
    },
    [assigneeOptions],
  );
  const loadLines = useMemo(() => buildUserLoadLines(items, nameById), [items, nameById]);
  const loadWarnings = useMemo(() => computeLoadWarnings(loadLines), [loadLines]);

  const assignReadOnlyTitle = useMemo(() => {
    if (planIsApproved) {
      return "Mese approvato: le assegnazioni non sono modificabili";
    }
    if (currentUserRole === "tutor") {
      return "Sola consultazione (tutor): le assegnazioni le gestiscono specializzando o amministratori in base al piano";
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
    return { planId: plan.id, yearMonth, locations: [...salaLocationsForPlanning] };
  }, [isAdmin, planIsApproved, plan.id, yearMonth, salaLocationsForPlanning]);

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3",
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
        <div className="flex items-center gap-2">
          <Link
            href={`/turni?month=${prevM}`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Mese prec.
          </Link>
          <Link
            href={`/turni?month=${nextM}`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Mese succ.
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-foreground">Mostra</span>
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
            onClick={() => setViewFilter({ kind: "me" })}
            title="Solo turni a te assegnati"
          >
            A me
          </Button>
          <div className="flex items-center gap-2">
            <label htmlFor="turni-filter-user" className="sr-only">
              Filtra per collega
            </label>
            <select
              id="turni-filter-user"
              className="h-9 min-w-[12rem] max-w-full rounded-md border border-input bg-card px-2 text-sm"
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
              <option value="">Solo assegnato a…</option>
              {assigneeOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name?.trim() || u.email?.trim() || u.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {assignError ? (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {assignError}
        </div>
      ) : null}

      {loadLines.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <p className="font-medium text-foreground">Carico per assegnatario</p>
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
                  <span className="tabular-nums">{l.total} turni</span>
                  {parts.length > 0 ? <span className="text-muted-foreground"> (</span> : null}
                  {parts.length > 0 ? <span>{parts.join(", ")}</span> : null}
                  {parts.length > 0 ? <span className="text-muted-foreground">)</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

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
            />
          ))
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium text-foreground">Azioni sul mese</p>
        {plan.status === "draft" && (currentUserRole === "admin" || currentUserRole === "specializzando") ? (
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
            <p className="mt-1.5 text-xs text-muted-foreground">Blocca le modifiche per tutti i turni del mese.</p>
          </form>
        ) : null}
        {isAdmin && plan.status === "approved" ? (
          <form action={reopenMonthlyPlanAction} className="pt-1">
            <input type="hidden" name="planId" value={plan.id} />
            <input type="hidden" name="month" value={yearMonth} />
            <Button type="submit" variant="outline" size="sm">
              Riapri mese
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground">Riporta il piano in bozza; annulla approvazione e sblocca assegnazioni.</p>
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
