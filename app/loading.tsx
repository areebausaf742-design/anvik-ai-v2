export default function Loading() {
  return (
    <div
      className="flex min-h-[calc(100dvh-64px)] flex-col items-center justify-center bg-[#050508] px-6 py-12 text-slate-200"
      role="status"
      aria-label="Loading ANVIK"
    >
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="h-16 w-16 animate-pulse rounded-full bg-gradient-to-tr from-[#7C3AED]/40 to-[#22D3EE]/40 blur-md" />
        <div className="absolute h-12 w-12 rounded-full border border-white/15 bg-gradient-to-tr from-[#7C3AED] to-[#22D3EE] opacity-80" />
      </div>
      <div className="mt-6 w-full max-w-md space-y-3">
        <div className="mx-auto h-4 w-40 animate-pulse rounded-lg bg-white/10" />
        <div className="h-20 w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
        <div className="h-12 w-3/4 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
      </div>
    </div>
  );
}
