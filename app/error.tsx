"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-[calc(100dvh-64px)] items-center justify-center bg-[#050508] px-4 py-12 text-slate-100">
      <div className="glass-card w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] p-7 text-center backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          {error?.message || "This screen ran into an unexpected problem. Your chats and API key are safe on this device."}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="btn-gradient inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
          >
            <RotateCcw className="h-4 w-4" /> Retry
          </button>
          <Link
            href="/chat"
            className="inline-flex min-h-[44px] items-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
          >
            Back to chat
          </Link>
        </div>
      </div>
    </main>
  );
}
