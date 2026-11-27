"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({
  className,
  ...props
}: React.HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      className={cn(
        "relative my-4 bg-[var(--theme-border)] h-[px]",
        className,
      )}
      {...props}
    />
  );
}
