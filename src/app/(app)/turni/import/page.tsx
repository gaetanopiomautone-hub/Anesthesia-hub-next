import { PageHeader } from "@/components/layout/page-header";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import { PlanningImportForm } from "./planning-import-form";

export default async function TurniImportPlanningPage() {
  const profile = await requireSection("turni");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Turnistica mensile"
        title="Import planning da Excel"
        description="Genera l’anteprima senza toccare il database; conferma solo se i numeri sono plausibili. Si crea un piano in bozza con sale, ambulatori e reperibilità (nessuna assegnazione utenti)."
      />
      <PlanningImportForm role={profile.role} />
    </div>
  );
}
