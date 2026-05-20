import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { FerieCalendarBlock } from "@/lib/domain/leave-calendar-markers";

/** Blocchi didattica/congresso nel mese per il calendario `/ferie`. */
export async function listFerieCalendarBlocksForMonth(monthStart: string, monthEnd: string): Promise<FerieCalendarBlock[]> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("trainee_planning_blocks")
    .select("id, block_date, kind, title")
    .gte("block_date", monthStart)
    .lte("block_date", monthEnd)
    .in("kind", ["didattica", "congresso"])
    .order("block_date", { ascending: true });

  if (error) {
    if (/relation|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    throw new Error(`trainee_planning_blocks calendar: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    blockDate: String(row.block_date ?? "").slice(0, 10),
    kind: String(row.kind ?? ""),
    title: row.title != null ? String(row.title) : undefined,
  }));
}
