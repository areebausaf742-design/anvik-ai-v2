import { Skeleton, SkeletonCard } from "@/components/anvik/skeleton";

export default function ChatLoading() {
  return (
    <div className="anvik-dark flex h-[100dvh] w-full overflow-hidden bg-[var(--theme-bg)]">
      <aside className="hidden md:flex w-[260px] flex-col gap-3 border-r border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-4">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </aside>
      <section className="flex flex-1 flex-col">
        <div className="h-16 border-b border-[var(--theme-border)] px-4 py-3">
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex-1 p-6 space-y-4 max-w-[760px] mx-auto w-full">
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="border-t border-[var(--theme-border)] p-4">
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </section>
    </div>
  );
}
