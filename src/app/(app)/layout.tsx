import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/get-current-user-profile";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell userName={user.full_name} role={user.role}>
      {children}
    </AppShell>
  );
}
