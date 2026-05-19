import { endOfMonth, endOfWeek, format, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";

import type { CurrentUserProfile } from "@/lib/auth/get-current-user-profile";
import type { AppRole } from "@/lib/auth/roles";
import { probeLogbookTraineeFilterColumn } from "@/lib/data/logbook";
import {
  probeShiftsAssigneeFilterColumn,
  type ShiftsAssigneeFilterColumn,
} from "@/lib/data/shifts";
import { mapLeaveRequestFromDb } from "@/lib/domain/leave-request-db";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type LeaveRequestRow = {
  id: string;
  request_type: "vacation" | "permission" | "sick_leave" | "conference" | "other";
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
};

type LogbookRow = {
  id: string;
  performed_on: string;
  supervision_level: "diretta" | "indiretta" | "assente";
  autonomy_level: "assistito" | "con_supervisione" | "autonomo";
  confidence_level: number;
  procedure_catalog: { name: string } | null;
};

type ShiftRow = {
  id: string;
  shift_date: string;
  shift_kind: "mattina" | "pomeriggio" | "giornaliero" | "notte" | "guardia" | "reperibilita";
  clinical_locations: { name: string; area_type: "sala_operatoria" | "rianimazione" } | null;
};

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function areaTypeLabel(areaType: "sala_operatoria" | "rianimazione") {
  switch (areaType) {
    case "rianimazione":
      return "Rianimazione";
    case "sala_operatoria":
    default:
      return "Sala operatoria";
  }
}

function shiftKindLabel(kind: ShiftRow["shift_kind"]) {
  switch (kind) {
    case "mattina":
      return "Mattina";
    case "pomeriggio":
      return "Pomeriggio";
    case "giornaliero":
      return "Giornaliero";
    case "notte":
      return "Notte";
    case "guardia":
      return "Guardia";
    case "reperibilita":
      return "Reperibilita'";
    default:
      return kind;
  }
}

export function leaveStatusLabel(status: LeaveRequestRow["status"]) {
  switch (status) {
    case "pending":
      return "In attesa";
    case "approved":
      return "Approvato";
    case "rejected":
      return "Rifiutato";
    case "cancelled":
      return "Annullato";
  }
}

export function supervisionLabel(level: LogbookRow["supervision_level"]) {
  switch (level) {
    case "diretta":
      return "Diretta";
    case "indiretta":
      return "Indiretta";
    case "assente":
      return "Assente";
    default:
      return level;
  }
}

export function autonomyLabel(level: LogbookRow["autonomy_level"]) {
  switch (level) {
    case "assistito":
      return "Assistito";
    case "con_supervisione":
      return "Con supervisione";
    case "autonomo":
      return "Autonomo";
    default:
      return level;
  }
}

function canReadLeaveRequests(role: AppRole) {
  return role === "specializzando" || role === "tutor" || role === "admin";
}

function canReadLogbookEntries(role: AppRole) {
  return role === "specializzando" || role === "tutor" || role === "admin";
}

async function countShiftsInRangeByArea(params: {
  weekStart: string;
  weekEnd: string;
  areaType: "sala_operatoria" | "rianimazione";
  assigneeId?: string;
  assigneeColumn?: ShiftsAssigneeFilterColumn | null;
}) {
  const supabase = await createServerSupabaseClient();

  const { data: locationIds, error: locationError } = await supabase
    .from("clinical_locations")
    .select("id")
    .eq("area_type", params.areaType);

  if (locationError) {
    throw new Error(`clinical_locations query failed: ${locationError.message}`);
  }

  const ids = (locationIds ?? []).map((row) => row.id);

  if (ids.length === 0) {
    return 0;
  }

  let query = supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .gte("shift_date", params.weekStart)
    .lte("shift_date", params.weekEnd)
    .in("location_id", ids);

  if (params.assigneeId && params.assigneeColumn) {
    query = query.eq(params.assigneeColumn, params.assigneeId);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`shifts area count failed: ${error.message}`);
  }

  return count ?? 0;
}

export async function getDashboardData(profile: CurrentUserProfile) {
  const supabase = await createServerSupabaseClient();
  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const monthStart = format(new Date(today.getFullYear(), today.getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd");
  const isTrainee = profile.role === "specializzando";

  const assigneeCol = isTrainee ? await probeShiftsAssigneeFilterColumn(supabase) : null;

  let upcomingShiftsQuery = supabase
    .from("shifts")
    .select(
      `
      id,
      shift_date,
      shift_kind,
      clinical_locations ( name, area_type )
    `,
    )
    .gte("shift_date", format(today, "yyyy-MM-dd"))
    .order("shift_date", { ascending: true })
    .order("shift_kind", { ascending: true })
    .limit(5);

  if (isTrainee && assigneeCol) {
    upcomingShiftsQuery = upcomingShiftsQuery.eq(assigneeCol, profile.id);
  }

  const { data: upcomingShifts, error: upcomingShiftsError } = await upcomingShiftsQuery;

  if (upcomingShiftsError) {
    throw new Error(`shifts query failed: ${upcomingShiftsError.message}`);
  }

  const normalizedUpcomingShifts: ShiftRow[] = (upcomingShifts ?? []).map((raw) => {
    const row = raw as {
      id: string;
      shift_date: string;
      shift_kind: ShiftRow["shift_kind"];
      clinical_locations:
        | { name: string; area_type: "sala_operatoria" | "rianimazione" }
        | { name: string; area_type: "sala_operatoria" | "rianimazione" }[]
        | null;
    };

    return {
      id: row.id,
      shift_date: row.shift_date,
      shift_kind: row.shift_kind,
      clinical_locations: firstOrNull(row.clinical_locations),
    };
  });

  let weekShiftCountQuery = supabase
    .from("shifts")
    .select("id", { count: "exact", head: true })
    .gte("shift_date", weekStart)
    .lte("shift_date", weekEnd);

  if (isTrainee && assigneeCol) {
    weekShiftCountQuery = weekShiftCountQuery.eq(assigneeCol, profile.id);
  }

  const { count: weekShiftCount, error: weekShiftError } = await weekShiftCountQuery;

  if (weekShiftError) {
    throw new Error(`shifts week count failed: ${weekShiftError.message}`);
  }

  const [salaWeekCount, riaWeekCount] = await Promise.all([
    countShiftsInRangeByArea({
      weekStart,
      weekEnd,
      areaType: "sala_operatoria",
      assigneeId: isTrainee ? profile.id : undefined,
      assigneeColumn: assigneeCol,
    }),
    countShiftsInRangeByArea({
      weekStart,
      weekEnd,
      areaType: "rianimazione",
      assigneeId: isTrainee ? profile.id : undefined,
      assigneeColumn: assigneeCol,
    }),
  ]);

  let leaveRows: LeaveRequestRow[] = [];
  let pendingLeaveCount = 0;

  if (canReadLeaveRequests(profile.role)) {
    let leaveQuery = supabase
      .from("leave_requests")
      .select("id, request_type, start_date, end_date, status")
      .order("created_at", { ascending: false })
      .limit(5);

    if (profile.role === "specializzando") {
      leaveQuery = leaveQuery.eq("user_id", profile.id);
    }

    const { data: leaves, error: leaveError } = await leaveQuery;

    if (leaveError) {
      throw new Error(`leave_requests query failed: ${leaveError.message}`);
    }

    leaveRows = (leaves ?? []).map((row) => {
      const mapped = mapLeaveRequestFromDb(row as Record<string, unknown>);
      return {
        id: mapped.id,
        request_type: mapped.request_type,
        start_date: mapped.start_date,
        end_date: mapped.end_date,
        status: mapped.status,
      };
    });

    if (profile.role === "specializzando") {
      const { count, error } = await supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("status", "in_attesa");

      if (error) {
        throw new Error(`leave_requests pending count failed: ${error.message}`);
      }

      pendingLeaveCount = count ?? 0;
    } else {
      const { count, error } = await supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_attesa");

      if (error) {
        throw new Error(`leave_requests pending count failed: ${error.message}`);
      }

      pendingLeaveCount = count ?? 0;
    }
  }

  let logbookRows: LogbookRow[] = [];
  let monthProcedureCount = 0;

  if (canReadLogbookEntries(profile.role)) {
    const logbookTraineeCol =
      profile.role === "specializzando" ? await probeLogbookTraineeFilterColumn(supabase) : null;

    let logbookQuery = supabase
      .from("logbook_entries")
      .select(
        `
        id,
        performed_on,
        supervision_level,
        autonomy_level,
        confidence_level,
        procedure_catalog ( name )
      `,
      )
      .order("performed_on", { ascending: false })
      .limit(5);

    if (profile.role === "specializzando" && logbookTraineeCol) {
      logbookQuery = logbookQuery.eq(logbookTraineeCol, profile.id);
    }

    const { data: logs, error: logbookError } = await logbookQuery;

    if (logbookError) {
      throw new Error(`logbook_entries query failed: ${logbookError.message}`);
    }

    logbookRows = (logs ?? []).map((raw) => {
      const row = raw as {
        id: string;
        performed_on: string;
        supervision_level: LogbookRow["supervision_level"];
        autonomy_level: LogbookRow["autonomy_level"];
        confidence_level: number;
        procedure_catalog: { name: string } | { name: string }[] | null;
      };

      return {
        id: row.id,
        performed_on: row.performed_on,
        supervision_level: row.supervision_level,
        autonomy_level: row.autonomy_level,
        confidence_level: row.confidence_level,
        procedure_catalog: firstOrNull(row.procedure_catalog),
      };
    });

    let monthCountQuery = supabase
      .from("logbook_entries")
      .select("id", { count: "exact", head: true })
      .gte("performed_on", monthStart)
      .lte("performed_on", monthEnd);

    if (profile.role === "specializzando" && logbookTraineeCol) {
      monthCountQuery = monthCountQuery.eq(logbookTraineeCol, profile.id);
    }

    const { count: monthCount, error: monthCountError } = await monthCountQuery;

    if (monthCountError) {
      throw new Error(`logbook month count failed: ${monthCountError.message}`);
    }

    monthProcedureCount = monthCount ?? 0;
  }

  const nextShift = normalizedUpcomingShifts[0] ?? null;
  const nextShiftLocation = nextShift?.clinical_locations;

  const weekShiftSubtitle = `${riaWeekCount} in rianimazione, ${salaWeekCount} in sala operatoria`;

  const procedureSubtitle = canReadLogbookEntries(profile.role)
    ? "Conteggio reale da logbook_entries nel mese corrente"
    : "Metrica non disponibile per questo ruolo (permessi logbook)";

  const fourthCardTitle = profile.role === "specializzando" ? "Richieste in attesa" : "Richieste da gestire";
  const fourthCardSubtitle =
    profile.role === "specializzando" ? "Le tue richieste ancora in approvazione" : "Richieste complessive in stato in attesa";
  const canViewProcedureMetrics = canReadLogbookEntries(profile.role);

  return {
    profile,
    weekShiftCount: weekShiftCount ?? 0,
    weekShiftSubtitle,
    pendingLeaveCount,
    monthProcedureCount,
    procedureSubtitle,
    fourthCardTitle,
    fourthCardSubtitle,
    canViewProcedureMetrics,
    upcomingShifts: normalizedUpcomingShifts,
    nextShift,
    nextShiftSubtitle: nextShiftLocation
      ? `${areaTypeLabel(nextShiftLocation.area_type)} · ${nextShiftLocation.name}`
      : "Nessuna assegnazione imminente",
    nextShiftTitle: nextShiftLocation?.name ?? "Nessun turno pianificato",
    nextShiftBadge: nextShift ? shiftKindLabel(nextShift.shift_kind) : "—",
    leaveRows,
    logbookRows,
    formatDate: (value: string) => format(new Date(value), "dd/MM/yyyy", { locale: it }),
    role: profile.role,
    isTrainee,
  };
}
