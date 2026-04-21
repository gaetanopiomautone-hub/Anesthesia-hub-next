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

  const first = Array.isArray(data.shiftUi) ? data.shiftUi[0] : null;

  return (
    <div style={{ padding: 24 }}>
      <h1>Turni &amp; Ferie</h1>
      <p style={{ marginBottom: 12, fontSize: 14, color: "#666" }}>STEP 4A-bis — shiftUi senza stringify</p>
      <div style={{ marginBottom: 8 }}>shiftUi count: {Array.isArray(data.shiftUi) ? data.shiftUi.length : 0}</div>
      <div style={{ marginBottom: 8 }}>first exists: {first ? "yes" : "no"}</div>
      <div>first type: {first ? typeof first : "null"}</div>
    </div>
  );
}
