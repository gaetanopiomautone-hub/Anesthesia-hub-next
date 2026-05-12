"use client";

import { useActionState } from "react";

import {
  addTraineeLocationCompetencyAction,
  type TraineeCompetencyActionState,
} from "@/app/(app)/admin/trainee-competency-actions";
import type { AssignmentLocationRow } from "@/lib/domain/assignment-locations";
import type { ClinicalAreaRow } from "@/lib/data/clinical-areas";
import type { AssignableShiftUserOption } from "@/lib/data/shifts";
import { Button } from "@/components/ui/button";

type Props = {
  assignees: AssignableShiftUserOption[];
  locations: AssignmentLocationRow[];
  areas: ClinicalAreaRow[];
};

export function TraineeCompetencyAddForm({ assignees, locations, areas }: Props) {
  const [state, action, pending] = useActionState<TraineeCompetencyActionState | null, FormData>(
    addTraineeLocationCompetencyAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="tc-trainee" className="text-xs font-medium text-muted-foreground">
            Specializzando
          </label>
          <select id="tc-trainee" name="traineeId" required className="h-9 rounded-md border border-input bg-card px-2">
            <option value="">Scegli…</option>
            {assignees.map((u) => (
              <option key={u.id} value={u.id}>
                {u.list_label.trim() || u.full_name?.trim() || u.email?.trim() || u.id}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tc-status" className="text-xs font-medium text-muted-foreground">
            Stato
          </label>
          <select id="tc-status" name="status" required className="h-9 rounded-md border border-input bg-card px-2">
            <option value="abilitato">Abilitato</option>
            <option value="preferenziale">Preferenziale</option>
            <option value="rotazione">In rotazione</option>
            <option value="non_assegnabile">Non assegnabile</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="tc-loc" className="text-xs font-medium text-muted-foreground">
            Sala / ambulatorio (catalogo)
          </label>
          <select id="tc-loc" name="assignmentLocationId" className="h-9 rounded-md border border-input bg-card px-2">
            <option value="">—</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.kind})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tc-area" className="text-xs font-medium text-muted-foreground">
            Area tipo (clinical_areas)
          </label>
          <select id="tc-area" name="clinicalAreaId" className="h-9 rounded-md border border-input bg-card px-2">
            <option value="">—</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
                {!a.is_active ? " · storico" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Almeno uno tra catalogo sala e area tipo deve essere valorizzato.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="tc-start" className="text-xs font-medium text-muted-foreground">
            Inizio (opz.)
          </label>
          <input id="tc-start" name="startsOn" type="date" className="h-9 rounded-md border border-input bg-card px-2" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tc-end" className="text-xs font-medium text-muted-foreground">
            Fine (opz.)
          </label>
          <input id="tc-end" name="endsOn" type="date" className="h-9 rounded-md border border-input bg-card px-2" />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="tc-note" className="text-xs font-medium text-muted-foreground">
          Nota (opz.)
        </label>
        <input id="tc-note" name="note" className="h-9 rounded-md border border-input bg-card px-2" maxLength={500} />
      </div>
      <Button type="submit" disabled={pending} size="sm" className="w-fit">
        Aggiungi competenza
      </Button>
      {state?.ok ? <p className="text-xs text-emerald-700">Registrato.</p> : null}
      {state && !state.ok ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
