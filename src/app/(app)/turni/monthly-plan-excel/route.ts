import { endOfMonth, format, parse } from "date-fns";
import { it } from "date-fns/locale";

import { requireSection } from "@/lib/auth/get-current-user-profile";
import { buildMonthlyPlanExcelBuffer } from "@/lib/excel/monthly-plan-excel";
import { getTurniShiftPlanMonthState } from "@/lib/data/turni-shift-plan-month-state";
import { getMonthlyShiftPlanByYearMonth, listShiftItemsByPlanId } from "@/lib/data/monthly-shift-plans";
import { isMonthlyShiftsPublished } from "@/lib/domain/monthly-shifts";
import { loadPlanningUnavailabilityForMonth } from "@/lib/data/planning-unavailability";
import { listAssignableUsers } from "@/lib/data/shifts";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const profile = await requireSection("turni");

  const url = new URL(req.url);
  const month = url.searchParams.get("month")?.trim();
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return new Response("Parametro month richiesto (formato yyyy-MM).", {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const monthAnchor = parse(month, "yyyy-MM", new Date());
  const y = monthAnchor.getFullYear();
  const m = monthAnchor.getMonth() + 1;

  const plan = await getMonthlyShiftPlanByYearMonth({ year: y, month: m });
  if (!plan) {
    if (profile.role === "specializzando") {
      try {
        const st = await getTurniShiftPlanMonthState(y, m);
        if (st.variant === "internal" || st.variant === "published") {
          return new Response(
            "L’export Excel è disponibile per i specializzandi solo dopo la pubblicazione ufficiale del piano al reparto.",
            {
              status: 403,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            },
          );
        }
      } catch {
        // trattato come nessun piano
      }
    }
    return new Response("Nessun piano per il mese indicato.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (profile.role === "specializzando" && !isMonthlyShiftsPublished(plan)) {
    return new Response(
      "L’export Excel è disponibile per i specializzandi solo dopo la pubblicazione ufficiale del piano al reparto.",
      {
        status: 403,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      },
    );
  }

  const items = await listShiftItemsByPlanId(plan.id);
  const monthStart = format(monthAnchor, "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(monthAnchor), "yyyy-MM-dd");

  let planningLeaves: Awaited<ReturnType<typeof loadPlanningUnavailabilityForMonth>>["leaves"] = [];
  let planningBlocks: Awaited<ReturnType<typeof loadPlanningUnavailabilityForMonth>>["blocks"] = [];
  try {
    const u = await loadPlanningUnavailabilityForMonth({ monthStart, monthEnd });
    planningLeaves = u.leaves;
    planningBlocks = u.blocks;
  } catch {
    planningLeaves = [];
    planningBlocks = [];
  }

  const assignees = await listAssignableUsers();
  const assigneeIdsOrdered = assignees.map((a) => a.id);
  const nameById = (userId: string) => {
    const o = assignees.find((x) => x.id === userId);
    return o?.list_label.trim() || o?.full_name?.trim() || o?.email?.trim() || userId;
  };

  const assignedIds = [...new Set(items.map((i) => i.assigned_to).filter((x): x is string => Boolean(x)))];
  const profileById = new Map<
    string,
    { nome: string; cognome: string; email: string | null; telefono: string | null }
  >();

  if (assignedIds.length > 0) {
    const supabase = await createServerSupabaseClient();
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

  const phoneById = (userId: string) => {
    const p = profileById.get(userId);
    return p?.telefono?.trim() ?? "";
  };

  const monthTitleRaw = format(monthAnchor, "MMMM yyyy", { locale: it });
  const monthLabel = monthTitleRaw.charAt(0).toLocaleUpperCase("it") + monthTitleRaw.slice(1);
  const generatedAtLabel = format(new Date(), "dd/MM/yyyy HH:mm", { locale: it });

  const buffer = buildMonthlyPlanExcelBuffer({
    plan,
    items,
    monthStart,
    monthEnd,
    monthLabel,
    generatedAtLabel,
    nameById,
    phoneById,
    planningLeaves,
    planningBlocks,
    assigneeIdsOrdered,
  });

  const filename = `turni-mensili-${month}.xlsx`;
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
