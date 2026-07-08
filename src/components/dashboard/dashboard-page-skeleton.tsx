"use client";

/**
 * Page-level skeleton for /dashboard loading.tsx (also reused while client
 * fetches progressive data). Matches PageHeader + metric / card layout.
 */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Φόρτωση dashboard">
      <div className="space-y-2">
        <div className="hq-skeleton-shimmer h-8 w-48 rounded-lg" />
        <div className="hq-skeleton-shimmer h-4 w-80 max-w-full rounded" />
      </div>
      <div className="hq-skeleton-shimmer h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="hq-skeleton-shimmer h-20 rounded-[12px]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="hq-skeleton-shimmer h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="hq-skeleton-shimmer h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="hq-skeleton-shimmer h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
