export default function Loading() {
  return (
    <div
      className="flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center bg-[#08090d] px-6 py-12 text-slate-200"
      role="status"
      aria-label="Loading ANVIK"
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute h-16 w-16 rounded-full border border-[#D97757]/25" />
        <div className="absolute h-12 w-12 animate-pulse rounded-full bg-[#D97757]/20 blur-md" />
        <div className="h-9 w-9 rounded-full border border-white/15 bg-white/[0.06]" />
      </div>
      <div className="mt-6 w-full max-w-md space-y-3">
        <div className="mx-auto h-4 w-40 animate-pulse rounded-lg bg-white/10" />
        <div className="h-20 w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        <div className="h-12 w-3/4 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      </div>
    </div>
  );
}
