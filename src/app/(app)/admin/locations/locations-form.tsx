"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createClinicalLocationAction } from "@/app/(app)/admin/locations-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LocationsForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [areaType, setAreaType] = useState<"sala_operatoria" | "rianimazione">("sala_operatoria");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    setOk(null);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("area_type", areaType);
    startTransition(async () => {
      const res = await createClinicalLocationAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setOk("Sala aggiunta.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="location-name">Nome sala</Label>
        <Input id="location-name" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="location-area">Area</Label>
        <select
          id="location-area"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={areaType}
          onChange={(e) => setAreaType(e.target.value === "rianimazione" ? "rianimazione" : "sala_operatoria")}
        >
          <option value="sala_operatoria">Sala operatoria</option>
          <option value="rianimazione">Rianimazione</option>
        </select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
      <Button type="button" onClick={onSubmit} disabled={isPending}>
        {isPending ? "Salvataggio..." : "Aggiungi sala"}
      </Button>
    </div>
  );
}
