import { Skeleton, SkeletonCard } from "@/components/anvik/skeleton";

export default function ImageLoading() {
  return (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] p-6">
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
