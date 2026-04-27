"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { HeartHandshake, MapPin, Phone, Plus, UserCircle, ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { PageHeader } from "@/components/ui/page-header";

type V = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  volunteer_role: string | null;
  volunteer_area: string | null;
  volunteer_since: string | null;
  task_count: number;
};

function roleStyle(role: string | null): { border: string; bg: string; label: string } {
  const r = (role ?? "").toLowerCase();
  if (r.includes("συντον") || r.includes("coordin")) {
    return { border: "border-amber-500/50", bg: "bg-amber-500/10", label: "text-amber-200" };
  }
  if (r.includes("επικοινων") || r.includes("pr")) {
    return { border: "border-sky-500/45", bg: "bg-sky-500/10", label: "text-sky-200" };
  }
  if (r.includes("πεδί") || r.includes("field")) {
    return { border: "border-emerald-500/45", bg: "bg-emerald-500/10", label: "text-emerald-200" };
  }
  if (r.includes("γραφεί") || r.includes("office")) {
    return { border: "border-violet-500/40", bg: "bg-violet-500/10", label: "text-violet-200" };
  }
  return { border: "border-[#C9A84C]/40", bg: "bg-[#C9A84C]/10", label: "text-[#E8C96B]" };
}

function VolunteersBody() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const router = useRouter();
  const [list, setList] = useState<V[]>([]);
  const [nd, setNd] = useState({ first_name: "", last_name: "", phone: "" });
  const [tOpen, setTOpen] = useState(false);
  const [sel, setSel] = useState<V | null>(null);
  const [t, setT] = useState({ title: "", due: "" });

  const load = useCallback(async () => {
    const r = await fetchWithTimeout("/api/volunteers");
    const j = (await r.json()) as { volunteers?: V[] };
    setList((j.volunteers as V[]) ?? []);
  }, []);

  useEffect(() => {
    if (can) void load();
  }, [can, load]);

  const stats = useMemo(() => {
    const byRole: Record<string, number> = {};
    const byArea: Record<string, number> = {};
    for (const v of list) {
      const role = (v.volunteer_role || "Χωρίς ρόλο").trim();
      byRole[role] = (byRole[role] ?? 0) + 1;
      const ar = (v.volunteer_area || "Χωρίς περιοχή").trim();
      byArea[ar] = (byArea[ar] ?? 0) + 1;
    }
    const topRoles = Object.entries(byRole)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const topAreas = Object.entries(byArea)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return { total: list.length, byRole, byArea, topRoles, topAreas };
  }, [list]);

  if (!can) {
    return <p className="p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="w-full min-w-0 max-w-6xl space-y-6">
      <PageHeader
        title="Εθελοντές"
        subtitle="Πρόσωπα, ρόλοι και περιοχές — με εργασίες ανά επαφή"
        actions={
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--accent-gold)]">
            <HeartHandshake className="h-5 w-5" />
          </div>
        }
      />

      <div
        className={
          lux.card +
          " !p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 border-l-4 border-l-[#C9A84C]/60"
        }
      >
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Σύνολο</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{stats.total}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Ρόλοι (τύποι)</p>
          <p className="mt-1 text-lg font-semibold text-[#C9A84C]">{Object.keys(stats.byRole).length || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Περιοχές</p>
          <p className="mt-1 text-lg font-semibold text-[#1e5fa8]">{Object.keys(stats.byArea).length || "—"}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Κορυφαίος ρόλος</p>
          <p className="mt-1 line-clamp-1 text-sm font-medium text-[var(--text-primary)]" title={stats.topRoles[0]?.[0] ?? ""}>
            {stats.topRoles[0] ? `${stats.topRoles[0][0]} (${stats.topRoles[0][1]})` : "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className={lux.card + " !p-4"}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#C9A84C]">Κατανομή ρόλων</h3>
          <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
            {stats.topRoles.length === 0 ? (
              <li className="text-[var(--text-muted)]">Χωρίς δεδομένα</li>
            ) : (
              stats.topRoles.map(([name, c]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate text-[var(--text-primary)]">{name}</span>
                  <span className="shrink-0 font-mono text-[var(--accent-gold)]">{c}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className={lux.card + " !p-4"}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#1e5fa8]">Κατανομή περιοχών</h3>
          <ul className="space-y-1.5 text-sm text-[var(--text-secondary)]">
            {stats.topAreas.length === 0 ? (
              <li className="text-[var(--text-muted)]">Χωρίς δεδομένα</li>
            ) : (
              stats.topAreas.map(([name, c]) => (
                <li key={name} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate text-[var(--text-primary)]">{name}</span>
                  <span className="shrink-0 font-mono text-[#93C5FD]">{c}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-3">
        <div className="grid w-full min-w-0 max-w-2xl grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <input
            className={lux.input}
            placeholder="Όνομα"
            value={nd.first_name}
            onChange={(e) => setNd((x) => ({ ...x, first_name: e.target.value }))}
          />
          <input
            className={lux.input}
            placeholder="Επίθετο"
            value={nd.last_name}
            onChange={(e) => setNd((x) => ({ ...x, last_name: e.target.value }))}
          />
          <input
            className={lux.input}
            placeholder="Τηλέφωνο"
            value={nd.phone}
            onChange={(e) => setNd((x) => ({ ...x, phone: e.target.value }))}
          />
        </div>
        <button
          type="button"
          className={lux.btnPrimary + " inline-flex items-center gap-1.5 shrink-0"}
          onClick={async () => {
            if (!nd.first_name.trim() || !nd.last_name.trim() || !nd.phone.trim()) return;
            const res = await fetchWithTimeout("/api/contacts", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...nd,
                call_status: "Pending",
                is_volunteer: true,
                priority: "Medium",
              }),
            });
            const j = (await res.json().catch(() => ({}))) as { contact?: { id: string } };
            if (j.contact?.id) {
              setNd({ first_name: "", last_name: "", phone: "" });
              void load();
              router.push(`/contacts/${j.contact.id}`);
            }
          }}
        >
          <Plus className="h-4 w-4" />
          Νέος εθελοντής
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((v) => {
          const st = roleStyle(v.volunteer_role);
          const name = `${v.first_name} ${v.last_name}`.trim();
          return (
            <div
              key={v.id}
              className={`group relative flex flex-col overflow-hidden rounded-2xl border ${st.border} ${st.bg} bg-gradient-to-b from-[var(--bg-card)]/95 to-[var(--bg-elevated)]/40 p-4 shadow-md transition hover:border-[#C9A84C]/50 hover:shadow-lg`}
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] text-[#C9A84C]">
                  <UserCircle className="h-8 w-8" />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/contacts/${v.id}`}
                    className="line-clamp-2 text-base font-bold text-[var(--text-primary)] transition group-hover:text-[#C9A84C] hover:underline"
                  >
                    {name}
                  </Link>
                  {v.volunteer_role ? (
                    <p className={`mt-0.5 inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.label} ring-1 ring-inset ring-white/10`}>
                      {v.volunteer_role}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">Ρόλος: —</p>
                  )}
                </div>
              </div>
              <div className="mt-auto space-y-2 text-sm text-[var(--text-secondary)]">
                <p className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-[#C9A84C]/80" />
                  <span className="font-mono text-xs">{v.phone || "—"}</span>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1e5fa8]/80" />
                  <span className="min-w-0">{v.volunteer_area || "—"}</span>
                </p>
                <div className="flex items-center justify-between gap-2 border-t border-[var(--border)]/50 pt-2 text-xs">
                  <span className="flex items-center gap-1 text-[var(--text-muted)]">
                    <ListChecks className="h-3.5 w-3.5" />
                    Εργασίες
                  </span>
                  <span className="font-mono text-[var(--accent-gold)]">{v.task_count}</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">Από: {v.volunteer_since ?? "—"}</div>
              </div>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-[#C9A84C]/30 bg-[#C9A84C]/10 py-2 text-xs font-semibold text-[#C9A84C] transition hover:bg-[#C9A84C]/20"
                onClick={() => {
                  setSel(v);
                  setTOpen(true);
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Νέα εργασία
              </button>
            </div>
          );
        })}
      </div>

      {tOpen && sel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-2xl">
            <p className="text-sm font-medium">
              {sel.first_name} {sel.last_name}
            </p>
            <input
              className={lux.input + " mt-2"}
              placeholder="Τίτλος εργασίας"
              value={t.title}
              onChange={(e) => setT((x) => ({ ...x, title: e.target.value }))}
            />
            <input className={lux.input + " mt-1"} type="date" value={t.due} onChange={(e) => setT((x) => ({ ...x, due: e.target.value }))} />
            <div className="mt-2 flex justify-end gap-2">
              <button type="button" className={lux.btnSecondary} onClick={() => setTOpen(false)}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnPrimary}
                onClick={async () => {
                  if (!t.title.trim()) return;
                  await fetchWithTimeout("/api/tasks", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contact_id: sel.id, title: t.title.trim(), due_date: t.due || null }),
                  });
                  setTOpen(false);
                  setT({ title: "", due: "" });
                  void load();
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VolunteersPage() {
  return (
    <Suspense fallback={<p>Φόρτωση…</p>}>
      <VolunteersBody />
    </Suspense>
  );
}
