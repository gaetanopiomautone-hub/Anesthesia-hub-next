import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type CardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function Card({ title, description, children, className }: CardProps) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      {(title || description) && (
        <header className="mb-4">
          {title ? <h2 className="text-base font-semibold text-foreground">{title}</h2> : null}
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}
