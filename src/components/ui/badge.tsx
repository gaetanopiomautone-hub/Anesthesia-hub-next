import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

const variants = {
  default: "bg-primary/10 text-primary",
  success: "bg-emerald-500/10 text-emerald-500",
  warning: "bg-amber-500/10 text-amber-500",
  danger: "bg-rose-500/10 text-rose-500",
} as const;

type BadgeProps = {
  children: ReactNode;
  variant?: keyof typeof variants;
};

export function Badge({ children, variant = "default" }: BadgeProps) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", variants[variant])}>{children}</span>;
}
