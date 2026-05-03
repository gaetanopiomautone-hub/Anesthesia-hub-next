"use client";

import { useState, useTransition } from "react";

import { createUserByAdmin } from "@/app/(app)/admin/create-user-actions";
import { ASSEGNAZIONE_LABEL_IT, ASSEGNAZIONE_SPECIALIZZANDO_VALUES } from "@/lib/domain/specializzando-assignment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels, type AppRole } from "@/lib/auth/roles";

export function CreateUserForm() {
  const [role, setRole] = useState<AppRole>("specializzando");
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [annoSpecialita, setAnnoSpecialita] = useState("1");
  const [assegnazione, setAssegnazione] = useState<(typeof ASSEGNAZIONE_SPECIALIZZANDO_VALUES)[number]>("rianimazione");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSpecializzando = role === "specializzando";

  const submit = () => {
    setError(null);
    setOk(null);
    const fd = new FormData();
    fd.set("nome", nome);
    fd.set("cognome", cognome);
    fd.set("email", email);
    fd.set("telefono", telefono);
    fd.set("role", role);
    if (isSpecializzando) {
      fd.set("anno_specialita", annoSpecialita);
      fd.set("assegnazione", assegnazione);
    }
    startTransition(async () => {
      const res = await createUserByAdmin(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOk(res.message);
      setNome("");
      setCognome("");
      setEmail("");
      setTelefono("");
      setAnnoSpecialita("1");
      setAssegnazione("rianimazione");
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-user-nome">Nome</Label>
          <Input
            id="new-user-nome"
            autoComplete="given-name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-user-cognome">Cognome</Label>
          <Input
            id="new-user-cognome"
            autoComplete="family-name"
            value={cognome}
            onChange={(e) => setCognome(e.target.value)}
            placeholder="Cognome"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-user-email">Email</Label>
        <Input
          id="new-user-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome.cognome@ospedale.it"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-user-telefono">Telefono (opzionale)</Label>
        <Input
          id="new-user-telefono"
          type="tel"
          autoComplete="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="+39 …"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-user-role">Ruolo</Label>
        <select
          id="new-user-role"
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

      {isSpecializzando ? (
        <div className="space-y-4 rounded-xl border border-border bg-secondary/40 p-4">
          <p className="text-sm font-medium text-foreground">Dati specifici specializzando</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-user-anno">Anno di specialità</Label>
              <select
                id="new-user-anno"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={annoSpecialita}
                onChange={(e) => setAnnoSpecialita(e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((y) => (
                  <option key={y} value={String(y)}>
                    {y}° anno
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-user-assegnazione">Assegnazione</Label>
              <select
                id="new-user-assegnazione"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={assegnazione}
                onChange={(e) =>
                  setAssegnazione(e.target.value as (typeof ASSEGNAZIONE_SPECIALIZZANDO_VALUES)[number])
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
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}

      <Button type="button" onClick={submit} disabled={isPending}>
        {isPending ? "Invio invito..." : "Invia invito email"}
      </Button>
    </div>
  );
}
