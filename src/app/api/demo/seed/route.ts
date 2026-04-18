import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth/get-current-user-profile";
import { demoLeaveRequests, demoLogbook, demoResources, demoShifts, demoUniversityEvents, demoUsers } from "@/lib/data/demo";

export async function GET() {
  await requireUser();

  return NextResponse.json({
    users: demoUsers,
    shifts: demoShifts,
    leaveRequests: demoLeaveRequests,
    universityEvents: demoUniversityEvents,
    resources: demoResources,
    logbook: demoLogbook,
  });
}
