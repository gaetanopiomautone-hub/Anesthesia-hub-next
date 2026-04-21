import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/get-current-user-profile";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireUser();

  return (
    <AppShell userName={profile.full_name} role={profile.role}>
      {children}
    </AppShell>
  );
}
