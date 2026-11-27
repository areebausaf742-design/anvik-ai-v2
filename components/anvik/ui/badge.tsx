"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "destructive" | "outline";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "bg-[var(--theme-text)] text-[var(--theme-bg)]",
    secondary: "bg-[var(--theme-surface-muted)] text-[var(--theme-text-secondary)]",
    destructive: "bg-[#b91c1c] text-[#ffffff]",
    outline: "border-[var(--theme-border)] text-[var(--theme-text)]",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-none transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
