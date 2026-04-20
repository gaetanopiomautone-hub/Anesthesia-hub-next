"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, requireUser } from "@/lib/auth/get-current-user-profile";
import { canAccess } from "@/lib/auth/permissions";
import type { AppRole } from "@/lib/auth/roles";
import { appRoles } from "@/lib/auth/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LEARNING_PDFS_BUCKET } from "@/lib/storage/learning-pdfs";
import { z } from "zod";

function assertArchivioSection(profile: { role: AppRole }) {
  if (!canAccess(profile.role, "archivio")) {
    redirect("/forbidden");
  }
}

function sanitizeFilename(name: string) {
  const base = name.replace(/[/\\]/g, "").replace(/\.\./g, "").trim() || "documento.pdf";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

const uploadSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function uploadLearningPdfAction(formData: FormData) {
  const profile = await requireUser();
  assertArchivioSection(profile);
  await requireRole(["admin"]);

  const parsed = uploadSchema.parse({
    title: formData.get("title"),
    description: formData.get("description"),
  });

  const visibilityRaw = formData.getAll("visibility");
  const visibility = visibilityRaw.filter((v): v is AppRole => typeof v === "string" && (appRoles as readonly string[]).includes(v));
  if (visibility.length === 0) {
    throw new Error("Seleziona almeno un ruolo con accesso al PDF.");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Seleziona un file PDF.");
  }

  if (file.size > 50 * 1024 * 1024) {
    throw new Error("Il file supera il limite di 50 MB.");
  }

  const mime = file.type || "application/octet-stream";
  if (mime !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Sono ammessi solo file PDF.");
  }

  const resourceId = randomUUID();
  const objectPath = `${resourceId}/${sanitizeFilename(file.name)}`;

  const supabase = await createServerSupabaseClient();

  const { error: uploadError } = await supabase.storage.from(LEARNING_PDFS_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: "application/pdf",
  });

  if (uploadError) {
    throw new Error(`Upload fallito: ${uploadError.message}`);
  }

  const { error: insertError } = await supabase.from("learning_resources").insert({
    id: resourceId,
    title: parsed.title.trim(),
    description: parsed.description?.trim() ? parsed.description.trim() : null,
    resource_type: "pdf",
    file_url: objectPath,
    external_url: null,
    visibility,
    created_by: profile.id,
  });

  if (insertError) {
    await supabase.storage.from(LEARNING_PDFS_BUCKET).remove([objectPath]);
    throw new Error(`Salvataggio metadati fallito: ${insertError.message}`);
  }

  revalidatePath("/archivio");
}
