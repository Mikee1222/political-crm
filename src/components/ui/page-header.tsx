import type { ReactNode } from "react";

type Props = {
  title: string;
  subtitle?: string;
  /** e.g. export / CTA group — right-aligned on sm+ */
  actions?: ReactNode;
  className?: string;
};

/**
 * Consistent “premium” page hero: big title, muted subtitle, 48px gold rule, optional actions.
 * Uses only CSS variables from globals (hq-page-header-*).
 */
export function PageHeader({ title, subtitle, actions, className = "" }: Props) {
  return (
    <header
      className={`hq-page-header relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[var(--card-shadow)] sm:p-6 md:p-8 ${className}`.trim()}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_100%_80%_at_100%_0%,rgba(201,168,76,0.1),transparent_50%),radial-gradient(ellipse_60%_50%_at_0%_100%,rgba(0,52,118,0.08),transparent_45%)] [data-theme='light']:from-transparent"
        aria-hidden
      />
      <div className="relative z-[1] flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="hq-page-title text-[1.75rem] font-bold leading-tight text-[var(--text-page-title)] [text-shadow:0_1px_2px_rgba(0,0,0,0.2)] [data-theme='light']:[text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
            {title}
          </h1>
          <div className="mt-2 h-0.5 w-12 rounded-full bg-gradient-to-r from-[var(--accent-gold)] to-[var(--accent-gold)]/30" />
          {subtitle ? (
            <p className="mt-3 max-w-2xl text-sm leading-[1.6] text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">{actions}</div> : null}
      </div>
    </header>
  );
}
