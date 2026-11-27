import { Skeleton, SkeletonCard } from "@/components/anvik/skeleton";

export default function CodeLoading() {
  return (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] p-6">
      <Skeleton className="h-8 w-40 mb-6" />
      <SkeletonCard />
    </div>
  );
}
