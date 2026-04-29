import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LocationsForm } from "./locations-form";

type LocationRow = {
  id: string;
  name: string;
  area_type: "sala_operatoria" | "rianimazione";
  is_active: boolean;
};

export default async function AdminLocationsPage() {
  await requireRole(["admin"]);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clinical_locations")
    .select("id,name,area_type,is_active")
    .order("name", { ascending: true });

  const rows = ((data ?? []) as LocationRow[]).filter(Boolean);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Gestione sale cliniche"
        description="Aggiungi nuove sale o sedi cliniche usate nella turnistica."
      />

      <Card title="Aggiungi sala">
        <LocationsForm />
      </Card>

      <Card title="Sale esistenti" description="Elenco clinical_locations in database">
        {error ? (
          <p className="text-sm text-destructive">Errore caricamento sale: {error.message}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna sala presente.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded border border-border px-3 py-2">
                <span>{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {r.area_type === "sala_operatoria" ? "Sala operatoria" : "Rianimazione"}
                  {r.is_active ? "" : " · Disattiva"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
