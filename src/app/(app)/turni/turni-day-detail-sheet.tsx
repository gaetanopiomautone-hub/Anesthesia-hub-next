"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { formatDateItalian } from "@/lib/domain/leave-request-shared";
import { cn } from "@/lib/utils/cn";

export function TurniDayDetailSheet({
  date,
  open,
  onOpenChange,
  children,
}: {
  date: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/80"
        aria-label="Chiudi dettaglio giorno"
        onClick={() => onOpenChange(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="turni-day-detail-title"
        className={cn(
          "absolute inset-0 flex flex-col bg-background shadow-xl",
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-2xl sm:border-l lg:max-w-3xl",
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 id="turni-day-detail-title" className="text-base font-semibold text-foreground">
            {date ? formatDateItalian(date) : "Dettaglio giorno"}
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 shrink-0 p-0"
            onClick={() => onOpenChange(false)}
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:px-4">{children}</div>
      </aside>
    </div>
  );
}
