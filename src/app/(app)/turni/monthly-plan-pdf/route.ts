import { endOfMonth, format, parse } from "date-fns";
import { it } from "date-fns/locale";

import { requireSection } from "@/lib/auth/get-current-user-profile";
import { buildMonthlyShiftPlanPdfTableRows } from "@/lib/domain/monthly-shift-plan-pdf-table";
import {
  formatShiftPlanPublicationLineItalian,
  isMonthlyShiftsPublished,
  monthlyShiftPlanStatusLabelItalian,
} from "@/lib/domain/monthly-shifts";
import { getMonthlyShiftPlanByYearMonth, listShiftItemsByPlanId } from "@/lib/data/monthly-shift-plans";
import { renderMonthlyShiftPlanPdfToBuffer } from "@/lib/pdf/monthly-shift-plan-pdf-render";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { profileDisplayName } from "@/lib/utils/profile-display";

/** Richiede runtime Node (pdfkit). Su Vercel le Route Handler App Router usano Node di default: compatibile. */
export const runtime = "nodejs";

export async function GET(req: Request) {
  const profile = await requireSection("turni");

  const url = new URL(req.url);
  const month = url.searchParams.get("month")?.trim();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response("Parametro month richiesto (formato yyyy-MM).", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const monthAnchor = parse(month, "yyyy-MM", new Date());
  const y = monthAnchor.getFullYear();
  const m = monthAnchor.getMonth() + 1;

  const plan = await getMonthlyShiftPlanByYearMonth({ year: y, month: m });
  if (!plan) {
    return new Response("Nessun piano per il mese indicato.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (plan.status !== "approved") {
    return new Response("Il PDF è disponibile solo dopo l’approvazione del piano mensile.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (profile.role !== "admin" && !isMonthlyShiftsPublished(plan)) {
    return new Response(
      "Il PDF ufficiale con reperibilità è disponibile dopo la pubblicazione del piano al reparto.",
      {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  const items = await listShiftItemsByPlanId(plan.id);
  const monthStart = format(monthAnchor, "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(monthAnchor), "yyyy-MM-dd");

  const assignedIds = [...new Set(items.map((i) => i.assigned_to).filter((x): x is string => Boolean(x)))];
  const profileById = new Map<
    string,
    { nome: string; cognome: string; email: string | null; telefono: string | null }
  >();

  if (assignedIds.length > 0) {
    const supabase = await createServerSupabaseClient();
    /** RLS: admin → anagrafica completa; altri → assignee solo se piano approvato e pubblicato. */
    const { data, error } = await supabase
      .from("profiles")
      .select("id, nome, cognome, email, telefono")
      .in("id", assignedIds);
    if (error) {
      return new Response(`Errore lettura profili: ${error.message}`, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      if (!id) continue;
      profileById.set(id, {
        nome: String((row as { nome?: string }).nome ?? ""),
        cognome: String((row as { cognome?: string }).cognome ?? ""),
        email: (row as { email?: string | null }).email ?? null,
        telefono: (row as { telefono?: string | null }).telefono ?? null,
      });
    }
  }

  const nameById = (userId: string) => {
    const p = profileById.get(userId);
    if (!p) return userId;
    return profileDisplayName({ nome: p.nome, cognome: p.cognome, email: p.email }) || userId;
  };

  const phoneById = (userId: string) => {
    const p = profileById.get(userId);
    return p?.telefono?.trim() ?? "";
  };

  const rows = buildMonthlyShiftPlanPdfTableRows({
    items,
    monthStart,
    monthEnd,
    nameById,
    phoneById,
  });

  const monthTitleRaw = format(monthAnchor, "MMMM yyyy", { locale: it });
  const monthTitleIt = monthTitleRaw.charAt(0).toLocaleUpperCase("it") + monthTitleRaw.slice(1);
  const generatedAtLabel = format(new Date(), "dd/MM/yyyy HH:mm", { locale: it });
  const orgLine = process.env.NEXT_PUBLIC_PLANNING_ORG_LABEL?.trim() || null;

  let approvedAtLabel: string | null = null;
  if (plan.approved_at) {
    const d = new Date(plan.approved_at);
    if (!Number.isNaN(d.getTime())) {
      approvedAtLabel = format(d, "dd/MM/yyyy HH:mm", { locale: it });
    }
  }

  const buffer = await renderMonthlyShiftPlanPdfToBuffer(rows, {
    orgLine,
    monthTitleIt,
    generatedAtLabel,
    planStatusLabel: monthlyShiftPlanStatusLabelItalian(plan.status),
    approvedAtLabel,
    publicationLine: formatShiftPlanPublicationLineItalian(plan),
    planIdShort: `${plan.id.slice(0, 8)}…`,
  });

  const filename = `turni-mensili-${month}.pdf`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
