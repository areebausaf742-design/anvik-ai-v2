import { Skeleton, SkeletonCard } from "@/components/anvik/skeleton";

export default function ArtifactsLoading() {
  return (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] p-6">
      <Skeleton className="h-8 w-40 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
