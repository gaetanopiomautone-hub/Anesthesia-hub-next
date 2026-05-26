import type { PortfolioBreakdownRow } from "@/lib/domain/logbook-portfolio";

export function PortfolioBreakdownTable({
  title,
  rows,
  emptyMessage = "Nessun dato nel periodo selezionato.",
}: {
  title: string;
  rows: PortfolioBreakdownRow[];
  emptyMessage?: string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Voce</th>
                <th className="px-3 py-2 text-right font-medium">Totale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-border/60">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
