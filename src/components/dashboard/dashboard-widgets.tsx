"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, Clock, Eye, Inbox, UserPlus, Users } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { lux } from "@/lib/luxury-styles";
import type { DashboardWidgetsData, NamedayDay } from "@/lib/dashboard-widgets-data";

const WIDGET_CARD =
  "flex min-h-[220px] flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-[var(--card-shadow)]";
const WIDGET_TITLE = "text-xs font-semibold uppercase tracking-widest text-[var(--accent-gold)]";

export const EMPTY_WIDGETS: DashboardWidgetsData = {
  namedays: [],
  recentInserts: [],
  recentUpdates: [],
  recentContactViews: [],
  recentRequestViews: [],
  recentRequests: [],
  groups: [],
};

function WidgetShell({
  title,
  icon: Icon,
  href,
  linkLabel = "δείτε όλα",
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  href?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={WIDGET_CARD}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className={WIDGET_TITLE}>{title}</h3>
        <Icon className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {href ? (
        <Link
          href={href}
          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-gold)] hover:underline"
        >
          {linkLabel}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <p className="text-sm text-[var(--text-muted)]">{text}</p>;
}

function NamedaySection({ day }: { day: NamedayDay }) {
  return (
    <div className="border-b border-[var(--border)]/60 py-2.5 last:border-0 last:pb-0 first:pt-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
        {day.label} {day.dateLabel}
      </p>
      {day.names.length === 0 ? (
        <p className="mt-1 text-sm text-[var(--text-muted)]">Δεν βρέθηκαν γιορτές</p>
      ) : (
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">{day.names.join(", ")}</p>
      )}
    </div>
  );
}

export function DashboardWidgetsGrid({ data }: { data: DashboardWidgetsData }) {
  return (
    <section
      className={[lux.cardFlat, "relative !overflow-hidden border-l-[3px] !border-l-[var(--accent-gold)] space-y-4 !p-5"].join(
        " ",
      )}
      aria-label="Dashboard widgets"
    >
      <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent-gold)]">Επισκόπηση</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <WidgetShell title="ΟΡΤΟΛΟΓΙΟ" icon={CalendarDays} href="/namedays">
          {data.namedays.length === 0 ? (
            <EmptyLine text="Δεν βρέθηκαν γιορτές" />
          ) : (
            <div>{data.namedays.map((d) => <NamedaySection key={d.label} day={d} />)}</div>
          )}
        </WidgetShell>

        <WidgetShell title="ΤΕΛΕΥΤΑΙΕΣ ΕΙΣΑΓΩΓΕΣ ΕΠΑΦΩΝ" icon={UserPlus} href="/contacts">
          {data.recentInserts.length === 0 ? (
            <EmptyLine text="Καμία πρόσφατη εισαγωγή." />
          ) : (
            <ul className="space-y-1">
              {data.recentInserts.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="block truncate rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>

        <WidgetShell title="ΤΕΛΕΥΤΑΙΕΣ ΕΝΗΜΕΡΩΣΕΙΣ ΕΠΑΦΩΝ" icon={Clock} href="/contacts">
          {data.recentUpdates.length === 0 ? (
            <EmptyLine text="Καμία πρόσφατη ενημέρωση." />
          ) : (
            <ul className="space-y-1">
              {data.recentUpdates.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="block truncate rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>

        <WidgetShell title="ΕΠΑΦΕΣ ΠΟΥ ΑΝΟΙΞΑΤΕ ΠΡΟΣΦΑΤΑ" icon={Eye} href="/contacts">
          {data.recentContactViews.length === 0 ? (
            <EmptyLine text="Δεν έχετε ανοίξει επαφές πρόσφατα." />
          ) : (
            <ul className="space-y-1">
              {data.recentContactViews.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/contacts/${c.id}`}
                    className="block truncate rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>

        <WidgetShell title="ΑΙΤΗΜΑΤΑ ΠΟΥ ΑΝΟΙΞΑΤΕ ΠΡΟΣΦΑΤΑ" icon={Eye} href="/requests">
          {data.recentRequestViews.length === 0 ? (
            <EmptyLine text="Δεν έχετε ανοίξει αιτήματα πρόσφατα." />
          ) : (
            <ul className="space-y-1">
              {data.recentRequestViews.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/requests/${r.id}`}
                    className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                  >
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{r.title}</p>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">{r.contactName}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>

        <WidgetShell title="ΤΕΛΕΥΤΑΙΑ ΚΑΤΑΧΩΡΗΜΕΝΑ ΑΙΤΗΜΑΤΑ" icon={Inbox} href="/requests">
          {data.recentRequests.length === 0 ? (
            <EmptyLine text="Κανένα πρόσφατο αίτημα." />
          ) : (
            <ul className="space-y-1">
              {data.recentRequests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/requests/${r.id}`}
                    className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)]"
                  >
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{r.title}</p>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">
                      {r.contactName}
                      {r.category ? ` · ${r.category}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>

        <WidgetShell title="ΟΜΑΔΕΣ ΠΡΟΣΩΠΩΝ" icon={Users} href="/analytics">
          {data.groups.length === 0 ? (
            <EmptyLine text="Δεν υπάρχουν ομάδες με μέλη." />
          ) : (
            <ul className="space-y-2">
              {data.groups.map((g) => (
                <li
                  key={g.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-elevated)_40%,transparent)] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: g.color ?? "var(--accent-gold)" }}
                      aria-hidden
                    />
                    <span className="truncate text-sm font-medium text-[var(--text-primary)]">{g.name}</span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--accent-gold)]">
                    {g.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </WidgetShell>
      </div>
    </section>
  );
}
