import { requireSection } from "@/lib/auth/get-current-user-profile";

export default async function TurniFeriePage() {
  await requireSection("turni-ferie");

  return (
    <div style={{ padding: 24 }}>
      <h1>Turni & Ferie</h1>
      <p>Auth OK</p>
    </div>
  );
}
