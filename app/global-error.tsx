"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN" className="dark" style={{ backgroundColor: "#050508", color: "#f8fafc" }}>
      <body className="flex min-h-dvh items-center justify-center bg-[#050508] px-4 text-slate-100 antialiased">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-white">ANVIK hit a snag</h1>
          <p className="mt-2 text-sm text-slate-400">
            {error?.message || "A fatal rendering error occurred. Click retry to reload cleanly."}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#22D3EE] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#7C3AED]/30"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
        </div>
      </body>
    </html>
  );
}
