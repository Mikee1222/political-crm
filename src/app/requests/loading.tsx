export default function RequestsLoading() {
  return (
    <div className="w-full space-y-6 px-4 md:px-0" aria-busy="true" aria-label="Φόρτωση αιτημάτων">
      <div className="space-y-2">
        <div className="hq-skeleton-shimmer h-8 w-40 rounded-lg" />
        <div className="hq-skeleton-shimmer h-4 w-80 max-w-full rounded" />
      </div>
      <div className="-mx-1 flex gap-3 overflow-hidden pb-1">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="hq-skeleton-shimmer h-16 w-24 shrink-0 rounded-xl" />
        ))}
      </div>
      <div className="hq-skeleton-shimmer h-12 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="hq-skeleton-shimmer h-52 rounded-[20px] border border-[var(--border)]/40"
          />
        ))}
      </div>
    </div>
  );
}
