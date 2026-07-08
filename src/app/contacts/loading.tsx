export default function ContactsLoading() {
  return (
    <div className="w-full space-y-6 px-4 md:px-0" aria-busy="true" aria-label="Φόρτωση επαφών">
      <div className="space-y-2">
        <div className="hq-skeleton-shimmer h-8 w-40 rounded-lg" />
        <div className="hq-skeleton-shimmer h-4 w-72 max-w-full rounded" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="hq-skeleton-shimmer h-20 rounded-xl" />
        ))}
      </div>
      <div className="hq-skeleton-shimmer h-12 w-full rounded-xl" />
      <ul className="space-y-3 md:hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <li
            key={i}
            className="hq-skeleton-shimmer h-[8.25rem] w-full rounded-[20px] border border-[var(--border)]/35"
          />
        ))}
      </ul>
      <div className="hidden space-y-2 md:block">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="hq-skeleton-shimmer h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
