"use client";

import { useActionState } from "react";

import { updateOwnProfileAction, type UpdateOwnProfileResult } from "@/app/(app)/profilo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROFILE_GENDER_UI_OPTIONS, type ProfileGender } from "@/lib/domain/profile-greeting";

export type OwnProfileInitial = {
  email: string;
  nome: string;
  cognome: string;
  telefono: string | null;
  gender: ProfileGender;
};

export function OwnProfileForm({ initial }: { initial: OwnProfileInitial }) {
  const [state, formAction, pending] = useActionState(updateOwnProfileAction, null as UpdateOwnProfileResult | null);

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div className="space-y-2">
        <Label htmlFor="pf-email">Email</Label>
        <Input id="pf-email" type="email" value={initial.email} readOnly className="bg-muted/50" />
        <p className="text-xs text-muted-foreground">L’email si modifica solo dall’amministratore.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pf-nome">Nome</Label>
          <Input id="pf-nome" name="nome" required defaultValue={initial.nome} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pf-cognome">Cognome</Label>
          <Input id="pf-cognome" name="cognome" required defaultValue={initial.cognome} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pf-tel">Telefono</Label>
        <Input id="pf-tel" name="telefono" type="tel" defaultValue={initial.telefono ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pf-gender">Come preferisci il saluto?</Label>
        <select
          id="pf-gender"
          name="gender"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          defaultValue={initial.gender ?? ""}
        >
          {PROFILE_GENDER_UI_OPTIONS.map((o) => (
            <option key={o.value || "unset"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">Opzionale. Non deduciamo nulla dal nome: scegli solo se vuoi «Benvenuto» o «Benvenuta» in dashboard.</p>
      </div>
      {state && !state.ok ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state?.ok ? <p className="text-sm text-emerald-800">Modifiche salvate.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvataggio…" : "Salva"}
      </Button>
    </form>
  );
}
