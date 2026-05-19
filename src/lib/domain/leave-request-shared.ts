import { format } from "date-fns";
import { it } from "date-fns/locale";

import { toLocalDateFromYmd } from "@/lib/dates/ymd";

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type LeaveRequestType = "vacation" | "permission" | "sick_leave" | "conference" | "other";

export type LeaveRequestRow = {
  id: string;
  user_id: string;
  request_type: LeaveRequestType;
  start_date: string;
  end_date: string;
  status: LeaveRequestStatus;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  cancelled_at: string | null;
  created_at: string;
  requester?: { full_name: string | null; email: string | null } | null;
  approver?: { full_name: string | null; email: string | null } | null;
};

export function leaveStatusLabelItalian(status: LeaveRequestStatus | null | undefined) {
  switch (status) {
    case "pending":
      return "In attesa";
    case "approved":
      return "Approvata";
    case "rejected":
      return "Rifiutata";
    case "cancelled":
      return "Annullata";
    default: {
      const fallback = String(status ?? "").trim();
      return fallback ? fallback : "Sconosciuto";
    }
  }
}

export function leaveTypeLabelItalian(type: LeaveRequestType | null | undefined) {
  switch (type) {
    case "vacation":
      return "Ferie";
    case "permission":
      return "Permesso";
    case "sick_leave":
      return "Malattia";
    case "conference":
      return "Congresso";
    case "other":
      return "Altro";
    default: {
      const fallback = String(type ?? "").trim();
      return fallback ? fallback : "Altro";
    }
  }
}

export function formatDateItalian(value: string) {
  try {
    const parsed = toLocalDateFromYmd(value);
    return format(parsed, "dd/MM/yyyy", { locale: it });
  } catch {
    return value?.trim() ? value : "—";
  }
}
