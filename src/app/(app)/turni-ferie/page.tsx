import { unstable_rethrow } from "next/navigation";

import { requireSection } from "@/lib/auth/get-current-user-profile";
import { loadTurniFeriePageData, resolveTurniFerieMonth } from "@/lib/data/shifts-leave";

export default async function TurniFeriePage() {
  try {
    const profile = await requireSection("turni-ferie");
    const { monthStart, monthEnd } = resolveTurniFerieMonth(undefined);

    const data = await loadTurniFeriePageData(profile, {
      monthStart,
      monthEnd,
      assigneeId: null,
    });

    return (
      <div style={{ padding: 24 }}>
        <h1>Turni &amp; Ferie</h1>
        <div>shifts: {data.shifts?.length ?? 0}</div>
        <div>leaves: {data.leaves?.length ?? 0}</div>
        <div>shiftUi: {data.shiftUi?.length ?? 0}</div>
        <div>conflicts: {data.conflicts?.length ?? 0}</div>
        <div>assigneeOptions: {data.assigneeOptions?.length ?? 0}</div>
        <div style={{ marginTop: 12 }}>OK — render minimale con dati veri (nessuna UI tabella/header).</div>
      </div>
    );
  } catch (error) {
    unstable_rethrow(error);

    return (
      <div style={{ padding: 24 }}>
        <h2>TURNI-FERIE DEBUG</h2>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
          {error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ""}` : String(error)}
        </pre>
      </div>
    );
  }
}
