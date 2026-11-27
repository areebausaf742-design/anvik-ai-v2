import { Skeleton, SkeletonCard } from "@/components/anvik/skeleton";

export default function SettingsLoading() {
  return (
    <div className="min-h-[100dvh] bg-[var(--theme-bg)] p-6">
      <Skeleton className="h-8 w-40 mb-6" />
      <div className="space-y-4 max-w-2xl">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
