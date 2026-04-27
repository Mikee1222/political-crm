/**
 * Placeholder nav rows while CRM profile/role is loading.
 */
export function SidebarNavSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="space-y-2 px-0.5" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-12 w-full max-w-full animate-pulse rounded-lg bg-[var(--nav-item-hover-bg)]/50"
        />
      ))}
    </div>
  );
}
