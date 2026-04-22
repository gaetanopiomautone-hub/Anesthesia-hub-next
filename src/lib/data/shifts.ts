import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canViewAllShifts } from "@/lib/domain/shift-permissions";
import { normalizeShiftStatus, type ShiftRow, type ShiftType } from "@/lib/domain/shift-shared";

/** Prefer canonical prod columns first (user_id), then dev/schema.sql variants. */
const ASSIGNEE_COLUMNS = ["user_id", "assignee_profile_id", "assignee_id"] as const;

type ShiftRaw = Record<string, unknown> & {
  id?: string | null;
  shift_date?: string | null;
  shift_kind?: string | null;
  shift_type?: string | null;
  status?: string | null;
  proposed_by?: string | null;
  submitted_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
};

function resolveShiftType(raw: ShiftRaw): ShiftType {
  const candidate = String(raw.shift_type ?? raw.shift_kind ?? "").trim();
  if (candidate === "mattina" || candidate === "pomeriggio" || candidate === "notte") return candidate;
  return "mattina";
}

function resolveAssigneeColumn(rows: ShiftRaw[]) {
  const first = rows[0];
  if (!first) return null;
  for (const column of ASSIGNEE_COLUMNS) {
    if (column in first) return column;
  }
  return null;
}

export async function listShiftsInMonth(profile: CurrentUserProfile, params: { monthStart: string; monthEnd: string }) {
  const supabase = await createServerSupabaseClient();

  // Always `select("*")` so we never break production where column names differ
  // (e.g. only `user_id` + `shift_kind`, no `shift_type` / `assignee_profile_id` / workflow cols).
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .gte("shift_date", params.monthStart)
    .lte("shift_date", params.monthEnd)
    .order("shift_date", { ascending: true });

  if (error) {
    throw new Error(`shifts query failed: ${error.message}`);
  }

  const rawRows = (data ?? []) as ShiftRaw[];
  const assigneeColumn = resolveAssigneeColumn(rawRows);
  const normalizedRows = rawRows.map((row) => {
    const userIdRaw = assigneeColumn ? row[assigneeColumn] : null;
    const userId = typeof userIdRaw === "string" && userIdRaw.trim() ? userIdRaw : null;
    const statusFallback = userId ? "approved" : "draft";
    return {
      id: String(row.id ?? ""),
      shift_date: String(row.shift_date ?? "").trim(),
      shift_type: resolveShiftType(row),
      user_id: userId,
      status: normalizeShiftStatus(row.status ?? statusFallback),
      proposed_by: typeof row.proposed_by === "string" && row.proposed_by.trim() ? row.proposed_by : null,
      submitted_at: typeof row.submitted_at === "string" && row.submitted_at.trim() ? row.submitted_at : null,
      approved_by: typeof row.approved_by === "string" && row.approved_by.trim() ? row.approved_by : null,
      approved_at: typeof row.approved_at === "string" && row.approved_at.trim() ? row.approved_at : null,
      rejected_by: typeof row.rejected_by === "string" && row.rejected_by.trim() ? row.rejected_by : null,
      rejected_at: typeof row.rejected_at === "string" && row.rejected_at.trim() ? row.rejected_at : null,
      rejection_reason: typeof row.rejection_reason === "string" && row.rejection_reason.trim() ? row.rejection_reason : null,
      assignee: null,
      proposer: null,
    } satisfies ShiftRow;
  });

  const visibleRows = canViewAllShifts(profile)
    ? normalizedRows
    : normalizedRows.filter((row) => row.user_id === profile.id);

  const profileIds = Array.from(new Set(visibleRows.flatMap((row) => [row.user_id, row.proposed_by]).filter(Boolean)));
  if (profileIds.length === 0) {
    return { rows: visibleRows, assigneeColumn };
  }

  const { data: assignees, error: assigneesError } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", profileIds);

  if (assigneesError) {
    throw new Error(`profiles query failed: ${assigneesError.message}`);
  }

  const assigneeById = new Map(
    (assignees ?? []).map((row) => [String(row.id), { id: String(row.id), full_name: row.full_name ?? null, email: row.email ?? null }]),
  );

  return {
    rows: visibleRows.map((row) => ({
      ...row,
      assignee: row.user_id ? assigneeById.get(row.user_id) ?? null : null,
      proposer: row.proposed_by ? assigneeById.get(row.proposed_by) ?? null : null,
    })),
    assigneeColumn,
  };
}

export async function listSubmittedShiftsInMonth(profile: CurrentUserProfile, params: { monthStart: string; monthEnd: string }) {
  if (!canViewAllShifts(profile) && profile.role !== "admin") {
    return [] as ShiftRow[];
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .gte("shift_date", params.monthStart)
    .lte("shift_date", params.monthEnd)
    .order("shift_date", { ascending: true });

  if (error) {
    throw new Error(`submitted shifts query failed: ${error.message}`);
  }

  const allRows = (data ?? []) as ShiftRaw[];
  const rawRows = allRows.filter((row) => normalizeShiftStatus(row.status) === "submitted");
  rawRows.sort(
    (a, b) =>
      String(a.shift_date ?? "").localeCompare(String(b.shift_date ?? "")) ||
      String(resolveShiftType(a)).localeCompare(String(resolveShiftType(b))),
  );
  const assigneeColumn = resolveShiftAssigneeColumn(rawRows);
  const normalizedRows: ShiftRow[] = rawRows.map((row) => {
    const userIdRaw = assigneeColumn ? row[assigneeColumn] : null;
    const userId = typeof userIdRaw === "string" && userIdRaw.trim() ? userIdRaw : null;
    return {
      id: String(row.id ?? ""),
      shift_date: String(row.shift_date ?? "").trim(),
      shift_type: resolveShiftType(row),
      user_id: userId,
      status: normalizeShiftStatus(row.status ?? "submitted"),
      proposed_by: typeof row.proposed_by === "string" && row.proposed_by.trim() ? row.proposed_by : null,
      submitted_at: typeof row.submitted_at === "string" && row.submitted_at.trim() ? row.submitted_at : null,
      approved_by: typeof row.approved_by === "string" && row.approved_by.trim() ? row.approved_by : null,
      approved_at: typeof row.approved_at === "string" && row.approved_at.trim() ? row.approved_at : null,
      rejected_by: typeof row.rejected_by === "string" && row.rejected_by.trim() ? row.rejected_by : null,
      rejected_at: typeof row.rejected_at === "string" && row.rejected_at.trim() ? row.rejected_at : null,
      rejection_reason: typeof row.rejection_reason === "string" && row.rejection_reason.trim() ? row.rejection_reason : null,
      assignee: null,
      proposer: null,
    };
  });

  const profileIds = Array.from(new Set(normalizedRows.flatMap((row) => [row.user_id, row.proposed_by]).filter(Boolean)));
  if (profileIds.length === 0) return normalizedRows;

  const { data: profiles, error: profilesError } = await supabase.from("profiles").select("id, full_name, email").in("id", profileIds);
  if (profilesError) {
    throw new Error(`profiles query failed: ${profilesError.message}`);
  }
  const profileById = new Map(
    (profiles ?? []).map((row) => [String(row.id), { id: String(row.id), full_name: row.full_name ?? null, email: row.email ?? null }]),
  );
  return normalizedRows.map((row) => ({
    ...row,
    assignee: row.user_id ? profileById.get(row.user_id) ?? null : null,
    proposer: row.proposed_by ? profileById.get(row.proposed_by) ?? null : null,
  }));
}

function resolveShiftAssigneeColumn(rows: ShiftRaw[]) {
  const first = rows[0];
  if (!first) return null;
  if ("user_id" in first) return "user_id";
  if ("assignee_profile_id" in first) return "assignee_profile_id";
  if ("assignee_id" in first) return "assignee_id";
  return null;
}

export async function listAssignableUsers() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("is_active", true)
    .in("role", ["specializzando", "tutor"])
    .order("full_name", { ascending: true });

  if (error) throw new Error(`assignable users query failed: ${error.message}`);
  return (data ?? []).map((u) => ({ id: String(u.id), full_name: u.full_name ?? null, email: u.email ?? null }));
}
