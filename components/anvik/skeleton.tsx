"use client";

import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder — shaped like real content, animated shimmer.
 * Honors prefers-reduced-motion (no shimmer).
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--theme-surface-muted)]",
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--theme-border)] bg-[var(--theme-surface)] p-6 space-y-3",
        className,
      )}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
