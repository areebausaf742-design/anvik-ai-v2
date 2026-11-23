"use client";

import type { ReactNode } from "react";

/** Stable surface card. Avoid per-pointer React state updates and 3D transforms. */
export default function TiltCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
 &lt;div className={`tilt-card relative overflow-hidden ${className}`}&gt;
      &lt;div
 aria-hidden="true"
 className="pointer-events-none absolute inset-0"
 style={{
          background:
            "radial-gradient(360px circle at 50% 50%, rgba(124, 58, 237, 0.08), transparent 72%)",
        }}
      /&gt;
 &lt;div className="relative z-10 h-full"&gt;{children}&lt;/div&gt;
 &lt;/div&gt;
  );
}
