import type { ReactNode } from "react";

type Props = {
  icon?: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Centered empty state: large icon/emoji, CTA, primary button slot.
 */
export function EmptyState({ icon, title, subtitle, action, className = "" }: Props) {
  return (
    <div
      className={`hq-empty-state flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/30 px-6 py-16 text-center ${className}`.trim()}
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center text-5xl [filter:drop-shadow(0_2px_8px_rgba(0,0,0,0.2))] [data-theme='light']:drop-shadow-sm"
        aria-hidden
      >
        {icon ?? "📋"}
      </div>
      <h3 className="text-lg font-bold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-[1.6] text-[var(--text-muted)]">{subtitle}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
