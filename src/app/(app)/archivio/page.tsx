import { ExternalLink, FileText, Upload } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireSection } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import { roleLabels } from "@/lib/auth/roles";
import { listLearningResources, visibilitySummary, type LearningResourceRow } from "@/lib/data/learning-resources";

import { uploadLearningPdfAction } from "./actions";

function roleCheckbox(role: AppRole) {
  return (
    <label key={role} className="flex items-center gap-2 text-sm">
      <input type="checkbox" name="visibility" value={role} defaultChecked className="rounded border-border" />
      {roleLabels[role]}
    </label>
  );
}

function resourceAudience(resource: LearningResourceRow) {
  return visibilitySummary(resource.visibility);
}

export default async function ArchivioPage() {
  const profile = await requireSection("archivio");
  const resources = await listLearningResources();
  const isAdmin = profile.role === "admin";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Archivio didattico"
        title="PDF, protocolli e link utili"
        description="Materiale formativo con visibilita per ruolo. I PDF sono in bucket privato: download tramite link firmato a breve scadenza."
      />

      {isAdmin ? (
        <Card title="Carica PDF (solo admin)">
          <form action={uploadLearningPdfAction} className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Titolo</label>
              <input name="title" required maxLength={200} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Descrizione (opzionale)</label>
              <textarea name="description" rows={3} maxLength={2000} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">Visibile a</span>
              <div className="flex flex-wrap gap-4">
                {roleCheckbox("specializzando")}
                {roleCheckbox("tutor")}
                {roleCheckbox("admin")}
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">File PDF</label>
              <input name="file" type="file" accept="application/pdf,.pdf" required className="text-sm" />
            </div>
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              <Upload className="h-4 w-4" />
              Carica e pubblica
            </button>
          </form>
        </Card>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna risorsa disponibile per il tuo ruolo.</p>
        ) : (
          resources.map((resource) => (
            <Card key={resource.id} title={resource.title} description={`Visibilita: ${resourceAudience(resource)}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {resource.resource_type === "pdf" ? <FileText className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                  {resource.resource_type === "pdf" ? "PDF" : "Link"}
                </div>
                {resource.resource_type === "pdf" ? (
                  <a href={`/archivio/download/${resource.id}`} className="text-sm font-medium text-primary">
                    Scarica PDF
                  </a>
                ) : resource.external_url ? (
                  <a href={resource.external_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary">
                    Apri link
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              {resource.description ? <p className="mt-3 text-sm text-muted-foreground">{resource.description}</p> : null}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
