const AppHeader = () => {
  return (
    <header className="h-14 border-b border-border bg-card/50 backdrop-blur-md flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs font-mono uppercase tracking-widest">
            Status:
          </span>
          <span className="text-clinical-green text-xs font-mono uppercase flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-clinical-green animate-pulse-glow" />
            Operativo
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-muted-foreground text-xs font-mono uppercase tracking-widest">
          Policlinico San Donato
        </span>
      </div>
      <div className="font-mono text-xs text-foreground flex items-center gap-4">
        <span className="bg-secondary px-2 py-1 border border-border tabular-nums rounded-sm">
          {new Date().toLocaleDateString("it-IT", {
            weekday: "short",
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
    </header>
  );
};

export default AppHeader;
