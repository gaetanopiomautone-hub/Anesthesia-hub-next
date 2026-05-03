import Link from "next/link";

import type { AppRole } from "@/lib/auth/roles";
import { roleLabels } from "@/lib/auth/roles";
import { pickSpecializzandiProfilesEmbed } from "@/lib/domain/specializzandi-embed";
import { cn } from "@/lib/utils/cn";

import { ASSEGNAZIONE_LABEL_IT } from "@/lib/domain/specializzando-assignment";

import { setUserActiveAdmin } from "./actions";

export type AdminUsersListRow = {
  id: string;
  nome: string;
  cognome: string;
  email: string;
  role: AppRole;
  telefono: string | null;
  is_active: boolean;
  specializzandi_profiles: unknown;
};

function spezLabel(role: AppRole, raw: unknown) {
  if (role !== "specializzando") return "—";
  const row = pickSpecializzandiProfilesEmbed(raw);
  if (!row) return "—";
  const asseg = ASSEGNAZIONE_LABEL_IT[row.assegnazione as keyof typeof ASSEGNAZIONE_LABEL_IT] ?? row.assegnazione;
  return `${row.anno_specialita}° anno · ${asseg}`;
}

export function AdminUsersTable({ rows }: { rows: AdminUsersListRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[880px] text-left text-sm">
        <thead className="border-b border-border bg-secondary/60 text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Nome</th>
            <th className="px-3 py-2 font-medium">Email</th>
            <th className="px-3 py-2 font-medium">Ruolo</th>
            <th className="px-3 py-2 font-medium">Telefono</th>
            <th className="px-3 py-2 font-medium">Anno / assegnazione</th>
            <th className="px-3 py-2 font-medium">Stato</th>
            <th className="px-3 py-2 font-medium text-right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 align-top font-medium">
                {u.nome} {u.cognome}
              </td>
              <td className="px-3 py-2 align-top text-muted-foreground">{u.email}</td>
              <td className="px-3 py-2 align-top">{roleLabels[u.role] ?? u.role}</td>
              <td className="px-3 py-2 align-top text-muted-foreground">{u.telefono?.trim() || "—"}</td>
              <td className="px-3 py-2 align-top text-muted-foreground">{spezLabel(u.role, u.specializzandi_profiles)}</td>
              <td className="px-3 py-2 align-top">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                    u.is_active ? "bg-emerald-500/15 text-emerald-900" : "bg-muted text-muted-foreground",
                  )}
                >
                  {u.is_active ? "Attivo" : "Disattivato"}
                </span>
              </td>
              <td className="px-3 py-2 align-top">
                <div className="flex flex-wrap justify-end gap-2">
                  <Link
                    href={`/admin/users/${u.id}/edit`}
                    className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
                  >
                    Modifica
                  </Link>
                  {u.is_active ? (
                    <form action={setUserActiveAdmin} className="inline">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="next_active" value="false" />
                      <button
                        type="submit"
                        className="rounded-lg border border-destructive/50 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      >
                        Disattiva
                      </button>
                    </form>
                  ) : (
                    <form action={setUserActiveAdmin} className="inline">
                      <input type="hidden" name="user_id" value={u.id} />
                      <input type="hidden" name="next_active" value="true" />
                      <button type="submit" className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-secondary">
                        Riattiva
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
