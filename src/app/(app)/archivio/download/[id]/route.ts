import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { LEARNING_PDFS_BUCKET } from "@/lib/storage/learning-pdfs";

const SIGNED_TTL_SECONDS = 120;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = await createServerSupabaseClient();

  const { data: row, error } = await supabase
    .from("learning_resources")
    .select("id, resource_type, file_url")
    .eq("id", id)
    .maybeSingle();

  if (error || !row || row.resource_type !== "pdf" || !row.file_url) {
    return new NextResponse("Non trovato", { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(LEARNING_PDFS_BUCKET)
    .createSignedUrl(row.file_url, SIGNED_TTL_SECONDS);

  if (signError || !signed?.signedUrl) {
    return new NextResponse("Impossibile generare il link di download", { status: 403 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
