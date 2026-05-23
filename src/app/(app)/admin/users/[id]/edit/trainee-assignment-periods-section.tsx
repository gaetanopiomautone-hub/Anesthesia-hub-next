"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addTraineeAssignmentPeriodAction,
  deleteTraineeAssignmentPeriodAction,
  updateTraineeAssignmentPeriodAction,
  type TraineeAssignmentPeriodActionState,
} from "@/app/(app)/admin/users/trainee-assignment-period-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ASSEGNAZIONE_LABEL_IT,
  ASSEGNAZIONE_SPECIALIZZANDO_VALUES,
  type AssegnazioneSpecializzando,
} from "@/lib/domain/specializzando-assignment";
import { isAssignmentPeriodActive, type TraineeAssignmentPeriodRow } from "@/lib/domain/trainee-assignment-period";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";

type Props = {
  traineeId: string;
  periods: TraineeAssignmentPeriodRow[];
};

function AmbitoSelect({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name?: string;
  value: AssegnazioneSpecializzando;
  onChange?: (v: AssegnazioneSpecializzando) => void;
}) {
  return (
    <select
      id={id}
      name={name}
      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value as AssegnazioneSpecializzando) : undefined}
      required
    >
      {ASSEGNAZIONE_SPECIALIZZANDO_VALUES.map((v) => (
        <option key={v} value={v}>
          {ASSEGNAZIONE_LABEL_IT[v]}
        </option>
      ))}
    </select>
  );
}

function AddPeriodForm({ traineeId }: { traineeId: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<TraineeAssignmentPeriodActionState | null, FormData>(
    addTraineeAssignmentPeriodAction,
    null,
  );
  const [ambito, setAmbito] = useState<AssegnazioneSpecializzando>("sala_base");

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  return (
    <form action={action} className="space-y-3 rounded-lg border border-dashed border-border bg-secondary/30 p-4">
      <p className="text-sm font-medium">Aggiungi periodo</p>
      <input type="hidden" name="traineeId" value={traineeId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="tap-start" className="text-xs">
            Dal
          </Label>
          <Input id="tap-start" name="startsOn" type="date" required className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tap-end" className="text-xs">
            Al
          </Label>
          <Input id="tap-end" name="endsOn" type="date" required className="h-9" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tap-ambito" className="text-xs">
            Ambito
          </Label>
          <AmbitoSelect id="tap-ambito" name="ambito" value={ambito} onChange={setAmbito} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tap-note" className="text-xs">
            Note (opz.)
          </Label>
          <Input id="tap-note" name="note" maxLength={500} className="h-9" />
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Salvataggio…" : "Aggiungi periodo"}
      </Button>
      {state?.ok ? <p className="text-xs text-emerald-700">Periodo aggiunto.</p> : null}
      {state && !state.ok ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}

function PeriodRow({ traineeId, period }: { traineeId: string; period: TraineeAssignmentPeriodRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deletePending, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [startsOn, setStartsOn] = useState(period.starts_on);
  const [endsOn, setEndsOn] = useState(period.ends_on);
  const [ambito, setAmbito] = useState<AssegnazioneSpecializzando>(period.ambito);
  const [note, setNote] = useState(period.note ?? "");

  const [updateState, updateAction, updatePending] = useActionState<
    TraineeAssignmentPeriodActionState | null,
    FormData
  >(updateTraineeAssignmentPeriodAction, null);

  useEffect(() => {
    if (updateState?.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [updateState, router]);

  const active = isAssignmentPeriodActive(period);

  const onDelete = () => {
    setDeleteError(null);
    if (!window.confirm("Eliminare questo periodo di assegnazione?")) return;
    startDelete(async () => {
      const res = await deleteTraineeAssignmentPeriodAction(period.id, traineeId);
      if (!res.ok) {
        setDeleteError(res.error);
        return;
      }
      router.refresh();
    });
  };

  if (editing) {
    return (
      <tr className="border-b border-border/70 bg-secondary/20 align-top">
        <td colSpan={6} className="py-3">
          <form action={updateAction} className="space-y-3">
            <input type="hidden" name="periodId" value={period.id} />
            <input type="hidden" name="traineeId" value={traineeId} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Dal</Label>
                <Input name="startsOn" type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Al</Label>
                <Input name="endsOn" type="date" required value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ambito</Label>
                <AmbitoSelect id={`tap-edit-ambito-${period.id}`} name="ambito" value={ambito} onChange={setAmbito} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Note (opz.)</Label>
                <Input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="h-9" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm" disabled={updatePending}>
                {updatePending ? "Salvataggio…" : "Salva modifiche"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
                Annulla
              </Button>
            </div>
            {updateState?.ok ? <p className="text-xs text-emerald-700">Aggiornato.</p> : null}
            {updateState && !updateState.ok ? <p className="text-xs text-destructive">{updateState.error}</p> : null}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/70 align-top">
      <td className="py-2 pr-2 whitespace-nowrap text-sm">{formatDateItalian(period.starts_on)}</td>
      <td className="py-2 pr-2 whitespace-nowrap text-sm">{formatDateItalian(period.ends_on)}</td>
      <td className="py-2 pr-2 text-sm">{ASSEGNAZIONE_LABEL_IT[period.ambito] ?? period.ambito}</td>
      <td className="max-w-[14rem] py-2 pr-2 text-xs text-muted-foreground">{period.note ?? "—"}</td>
      <td className="py-2 pr-2">
        {active ? (
          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">
            Attivo
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-2">
        <div className="flex flex-wrap gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            Modifica
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onDelete} disabled={deletePending}>
            Elimina
          </Button>
        </div>
        {deleteError ? <p className="mt-1 text-xs text-destructive">{deleteError}</p> : null}
      </td>
    </tr>
  );
}

export function TraineeAssignmentPeriodsSection({ traineeId, periods }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Periodi di assegnazione</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Storico degli ambiti nel tempo. Più periodi sono ammessi, anche nello stesso ambito in anni diversi.
          Non sono consentite sovrapposizioni date nello stesso ambito; ambiti diversi possono coesistere.
        </p>
      </div>

      <AddPeriodForm traineeId={traineeId} />

      {periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun periodo registrato.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Dal</th>
                <th className="py-2 pr-2 font-medium">Al</th>
                <th className="py-2 pr-2 font-medium">Ambito</th>
                <th className="py-2 pr-2 font-medium">Note</th>
                <th className="py-2 pr-2 font-medium">Stato</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <PeriodRow key={p.id} traineeId={traineeId} period={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
