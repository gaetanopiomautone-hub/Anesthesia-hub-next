"use client";

import { approveShiftAction, rejectShiftAction, saveShiftDraftAction, submitShiftProposalAction } from "@/app/(app)/turni/actions";
import { Badge } from "@/components/ui/badge";
import { canEditShiftProposal } from "@/lib/domain/shift-permissions";
import { assigneeLabel, normalizeShiftStatus, shiftStatusLabelItalian, shiftTypeLabelItalian, type ShiftRow } from "@/lib/domain/shift-shared";

type ShiftListProps = {
  rows: ShiftRow[];
  month: string;
  day: string | null;
  currentUserId: string;
  currentUserRole: "specializzando" | "tutor" | "admin";
  canPropose: boolean;
  canApprove: boolean;
  assigneeOptions: Array<{ id: string; full_name: string | null; email: string | null }>;
};

export function ShiftList({ rows, month, day, currentUserId, currentUserRole, canPropose, canApprove, assigneeOptions }: ShiftListProps) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun turno per il giorno selezionato.</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge>{shiftTypeLabelItalian(row.shift_type)}</Badge>
                <Badge variant="default">{shiftStatusLabelItalian(normalizeShiftStatus(row.status))}</Badge>
                <span className="text-sm text-muted-foreground">{row.shift_date}</span>
              </div>
              <p className="text-sm">{assigneeLabel(row)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canPropose &&
              canEditShiftProposal({
                user: { id: currentUserId, role: currentUserRole },
                shift: { status: row.status, proposed_by: row.proposed_by },
              }) ? (
                <>
                  <form action={saveShiftDraftAction} className="flex items-center gap-2">
                    <input type="hidden" name="shiftId" value={row.id} />
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="day" value={day ?? ""} />
                    <select name="userId" required className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
                      <option value={row.user_id ?? ""}>Assegnatario bozza...</option>
                      {assigneeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.full_name?.trim() || option.email?.trim() || option.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      Salva bozza
                    </button>
                  </form>
                  <form action={submitShiftProposalAction} className="flex items-center gap-2">
                    <input type="hidden" name="shiftId" value={row.id} />
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="day" value={day ?? ""} />
                    <select name="userId" required className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
                      <option value={row.user_id ?? ""}>Invia proposta per...</option>
                      {assigneeOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.full_name?.trim() || option.email?.trim() || option.id}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      Invia per validazione
                    </button>
                  </form>
                </>
              ) : null}

              {canApprove ? (
                <>
                  <form action={approveShiftAction}>
                    <input type="hidden" name="shiftId" value={row.id} />
                    <input type="hidden" name="userId" value={row.user_id ?? ""} />
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="day" value={day ?? ""} />
                    <button
                      type="submit"
                      className="rounded-lg border border-green-200 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50"
                    >
                      Approva
                    </button>
                  </form>
                  <form action={rejectShiftAction}>
                    <input type="hidden" name="shiftId" value={row.id} />
                    <input type="hidden" name="month" value={month} />
                    <input type="hidden" name="day" value={day ?? ""} />
                    <button
                      type="submit"
                      className="rounded-lg border border-destructive/30 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
                    >
                      Rifiuta
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
