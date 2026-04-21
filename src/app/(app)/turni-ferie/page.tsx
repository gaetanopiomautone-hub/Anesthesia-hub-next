import { requireSection } from "@/lib/auth/get-current-user-profile";
import { loadTurniFeriePageData, resolveTurniFerieMonth } from "@/lib/data/shifts-leave";

export default async function TurniFeriePage() {
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
      <p style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>STEP 3 — render minimale (nessuna tabella / formatter UI).</p>

      <ul style={{ marginBottom: 16 }}>
        <li>shifts: {data.shifts?.length ?? 0}</li>
        <li>shiftUi: {data.shiftUi?.length ?? 0}</li>
        <li>leaves: {data.leaves?.length ?? 0}</li>
        <li>conflicts: {data.conflicts?.length ?? 0}</li>
        <li>assigneeOptions (specializzandi): {data.assigneeOptions?.length ?? 0}</li>
      </ul>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Primo turno</h2>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, marginBottom: 24 }}>
        {JSON.stringify(data.shifts?.[0] ?? null, null, 2)}
      </pre>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>Prima ferie</h2>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(data.leaves?.[0] ?? null, null, 2)}</pre>
    </div>
  );
}
