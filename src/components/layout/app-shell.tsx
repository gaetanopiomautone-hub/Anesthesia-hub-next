"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LayoutGrid,
  LibraryBig,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";

import { logoutAction } from "@/app/(auth)/login/actions";
import { canAccess } from "@/lib/auth/permissions";
import { roleLabels, type AppRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils/cn";

const navigation = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/turni", label: "Turni", icon: CalendarDays },
  { href: "/turni-ferie", label: "Turni & Ferie", icon: CalendarRange },
  { href: "/ferie", label: "Ferie e desiderata", icon: ShieldCheck },
  { href: "/universita", label: "Impegni universitari", icon: GraduationCap },
  { href: "/archivio", label: "Archivio didattico", icon: LibraryBig },
  { href: "/logbook", label: "Logbook", icon: ClipboardList },
  { href: "/report", label: "Report", icon: FileText },
  { href: "/admin/users", label: "Utenti", icon: Users },
  { href: "/admin/users/new", label: "Nuovo utente", icon: UserPlus },
  { href: "/admin/locations", label: "Sale cliniche", icon: Building2 },
  { href: "/admin/clinical-areas", label: "Aree turni", icon: LayoutGrid },
];

type AppShellProps = {
  children: React.ReactNode;
  userName: string;
  role: AppRole;
};

export function AppShell({ children, userName, role }: AppShellProps) {
  const pathname = usePathname() ?? "";

  return (
    <div className="min-h-screen bg-background">
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          zIndex: 9999,
          background: "red",
          color: "white",
          padding: "6px 10px",
          fontSize: "12px",
          fontWeight: "bold",
        }}
      >
        BUILD 1e4a1f2
      </div>
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[260px_1fr]">
        <aside className="rounded-3xl border border-border bg-card p-5">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.24em] text-primary">Policlinico San Donato</p>
            <h1 className="mt-2 text-xl font-semibold text-foreground">Anesthesia Hub</h1>
            <p className="mt-3 text-sm text-muted-foreground">{userName}</p>
            <p className="text-sm text-muted-foreground">{roleLabels[role]}</p>
          </div>

          <nav className="space-y-1">
            {navigation.filter((item) => canAccess(role, item.href.slice(1) as Parameters<typeof canAccess>[1])).map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <form action={logoutAction} className="mt-8">
            <button className="w-full rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              Logout
            </button>
          </form>
        </aside>

        <main className="space-y-6">{children}</main>
      </div>
    </div>
  );
}
