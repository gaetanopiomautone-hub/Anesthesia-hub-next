"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClinicalAreaAction } from "@/app/(app)/admin/clinical-areas-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClinicalAreasForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    setOk(null);
    const fd = new FormData();
    fd.set("code", code);
    fd.set("name", name);
    fd.set("description", description);
    fd.set("sort_order", sortOrder);
    startTransition(async () => {
      const res = await createClinicalAreaAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCode("");
      setName("");
      setDescription("");
      setSortOrder("0");
      setOk("Area creata.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="clinical-area-code">Codice univoco</Label>
        <Input
          id="clinical-area-code"
          name="code"
          required
          value={code}
          placeholder="es. sala_base"
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinical-area-name">Nome visualizzato</Label>
        <Input id="clinical-area-name" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinical-area-desc">Descrizione (opzionale)</Label>
        <textarea
          id="clinical-area-desc"
          name="description"
          className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clinical-area-sort">Ordine lista</Label>
        <Input
          id="clinical-area-sort"
          name="sort_order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      <Button type="button" onClick={onSubmit} disabled={isPending}>
        {isPending ? "Salvataggio…" : "Aggiungi area"}
      </Button>
    </div>
  );
}
