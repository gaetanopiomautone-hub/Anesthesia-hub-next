"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ASSEGNAZIONE_LABEL_IT,
  ASSEGNAZIONE_SPECIALIZZANDO_VALUES,
  type AssegnazioneSpecializzando,
} from "@/lib/domain/specializzando-assignment";
import { updateUserAdmin } from "@/app/(app)/admin/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, type AppRole } from "@/lib/auth/roles";

export type EditUserInitial = {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  telefono: string | null;
  role: AppRole;
  is_active: boolean;
  anno_specialita: number | null;
  assegnazione: string | null;
};

export function EditUserForm({ initial }: { initial: EditUserInitial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [nome, setNome] = useState(initial.nome);
  const [cognome, setCognome] = useState(initial.cognome);
  const [email, setEmail] = useState(initial.email);
  const [telefono, setTelefono] = useState(initial.telefono ?? "");
  const [role, setRole] = useState<AppRole>(initial.role);
  const [isActive, setIsActive] = useState(initial.is_active);
  const [anno, setAnno] = useState(String(initial.anno_specialita ?? 1));
  const [assegnazione, setAssegnazione] = useState<AssegnazioneSpecializzando>(() =>
    initial.assegnazione &&
      (ASSEGNAZIONE_SPECIALIZZANDO_VALUES as readonly string[]).includes(initial.assegnazione)
      ? (initial.assegnazione as AssegnazioneSpecializzando)
      : "rianimazione",
  );

  const isSpez = role === "specializzando";

  const submit = () => {
    setError(null);
    setOk(null);
    const fd = new FormData();
    fd.set("user_id", initial.id);
    fd.set("nome", nome.trim());
    fd.set("cognome", cognome.trim());
    fd.set("email", email.trim().toLowerCase());
    fd.set("telefono", telefono.trim());
    fd.set("role", role);
    fd.set("is_active", isActive ? "true" : "false");
    if (isSpez) {
      fd.set("anno_specialita", anno);
      fd.set("assegnazione", assegnazione);
    }
    start(async () => {
      const res = await updateUserAdmin(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOk(res.message ?? "Salvato.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="eu-nome">Nome</Label>
          <Input id="eu-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="eu-cognome">Cognome</Label>
          <Input id="eu-cognome" value={cognome} onChange={(e) => setCognome(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="eu-email">Email</Label>
        <Input id="eu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p className="text-xs text-muted-foreground">La modifica viene propagata anche a Supabase Auth (login).</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="eu-tel">Telefono</Label>
        <Input id="eu-tel" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="eu-role">Ruolo</Label>
        <select
          id="eu-role"
          className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
        >
          {(["specializzando", "tutor", "admin"] as const).map((r) => (
            <option key={r} value={r}>
              {roleLabels[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
        <input
          id="eu-active"
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <Label htmlFor="eu-active" className="cursor-pointer font-normal">
          Account attivo
        </Label>
      </div>

      {isSpez ? (
        <div className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-medium">Dati specifici specializzando</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="eu-anno">Anno di specialità</Label>
              <select
                id="eu-anno"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={anno}
                onChange={(e) => setAnno(e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={String(y)}>
                    {y}° anno
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="eu-asseg">Assegnazione</Label>
              <select
                id="eu-asseg"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assegnazione}
                onChange={(e) =>
                  setAssegnazione(e.target.value as AssegnazioneSpecializzando)
                }
              >
                {ASSEGNAZIONE_SPECIALIZZANDO_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {ASSEGNAZIONE_LABEL_IT[v]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-800">{ok}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Salvataggio..." : "Salva modifiche"}
        </Button>
        <Link href="/admin/users" className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">
          Torna alla lista
        </Link>
      </div>
    </div>
  );
}
