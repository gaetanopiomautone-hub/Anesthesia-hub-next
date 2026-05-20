import type { LeaveRequestRow, LeaveRequestStatus, LeaveRequestType } from "@/lib/domain/leave-request-shared";

/** Tipo evento in calendario (bordo/sfondo); lo stato è separato (pill). */
export type CalendarEventKind = "leave" | "congress" | "lesson";

export type CalendarMarker =
  | { kind: "leave"; status: LeaveRequestStatus; date: string; id: string }
  | { kind: "congress"; date: string; id: string }
  | { kind: "lesson"; date: string; id: string; title?: string };

export type FerieCalendarBlock = {
  id: string;
  blockDate: string;
  kind: string;
  title?: string;
};

export function leaveRequestTypeToCalendarKind(type: LeaveRequestType): CalendarEventKind {
  if (type === "conference") return "congress";
  return "leave";
}

export function planningBlockKindToCalendarKind(kind: string): CalendarEventKind | null {
  const k = kind.trim().toLowerCase();
  if (k === "congresso") return "congress";
  if (k === "didattica") return "lesson";
  return null;
}

function overlapsDay(start: string, end: string, ymd: string) {
  return start <= ymd && end >= ymd;
}

export function buildCalendarMarkersForDay(params: {
  ymd: string;
  leaves: LeaveRequestRow[];
  blocks: FerieCalendarBlock[];
}): CalendarMarker[] {
  const { ymd, leaves, blocks } = params;
  const markers: CalendarMarker[] = [];

  for (const leave of leaves) {
    if (!overlapsDay(leave.start_date, leave.end_date, ymd)) continue;
    const eventKind = leaveRequestTypeToCalendarKind(leave.request_type);
    if (eventKind === "congress") {
      markers.push({ kind: "congress", date: ymd, id: leave.id });
    } else {
      markers.push({ kind: "leave", status: leave.status, date: ymd, id: leave.id });
    }
  }

  for (const block of blocks) {
    if (block.blockDate !== ymd) continue;
    const eventKind = planningBlockKindToCalendarKind(block.kind);
    if (eventKind === "congress") {
      markers.push({ kind: "congress", date: ymd, id: block.id });
    } else if (eventKind === "lesson") {
      markers.push({ kind: "lesson", date: ymd, id: block.id, title: block.title });
    }
  }

  return markers;
}

export const CALENDAR_EVENT_BORDER: Record<CalendarEventKind, string> = {
  leave: "border-blue-500 bg-blue-50/60",
  congress: "border-purple-500 bg-purple-50/60",
  lesson: "border-orange-500 bg-orange-50/60",
};

export const CALENDAR_STATUS_PILL: Record<LeaveRequestStatus, string> = {
  pending: "bg-gray-500 text-white",
  approved: "bg-green-600 text-white",
  rejected: "bg-red-600 text-white",
  cancelled: "bg-gray-300 text-gray-700",
};

export function calendarStatusPillLabel(status: LeaveRequestStatus): string {
  switch (status) {
    case "pending":
      return "Att.";
    case "approved":
      return "Ok";
    case "rejected":
      return "No";
    case "cancelled":
      return "An.";
  }
}
