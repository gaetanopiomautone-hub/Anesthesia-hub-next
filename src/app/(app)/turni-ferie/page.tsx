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
      <p style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>STEP 4A — shiftUi only</p>
      <div style={{ marginBottom: 12 }}>shiftUi: {data.shiftUi?.length ?? 0}</div>
      <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{JSON.stringify(data.shiftUi?.[0] ?? null, null, 2)}</pre>
    </div>
  );
}
