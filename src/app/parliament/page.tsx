"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { PageHeader } from "@/components/ui/page-header";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { Building2, Loader2, RefreshCw, Search } from "lucide-react";
import { MP_BIO } from "@/lib/parliament-mp-bio";

type Q = {
  id: string;
  title: string;
  ministry: string | null;
  status: string;
  submitted_date: string | null;
  answer_date: string | null;
  description: string | null;
  answer_text: string | null;
  related_contact_id: string | null;
};

type L = {
  id: string;
  title: string;
  law_number: string | null;
  status: string;
  vote: string | null;
  date: string | null;
  ministry: string | null;
};

type MediaItem = { title: string; source: string; date: string; snippet: string; link: string };
type Saved = { id: string; title: string; source: string | null; link: string | null; created_at: string };

const Q_STATUS: Record<string, string> = {
  Κατατέθηκε: "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/30",
  "Σε εξέλιξη": "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30",
  Απαντήθηκε: "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30",
  Αρχειοθετήθηκε: "bg-slate-500/20 text-slate-200 ring-1 ring-slate-500/30",
};

const VOTE_COL: Record<string, string> = {
  Υπέρ: "bg-emerald-500/20 text-emerald-200",
  Κατά: "bg-red-500/20 text-red-200",
  Απών: "bg-slate-500/20 text-slate-200",
};

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-4 py-2 text-sm font-semibold",
        active ? "bg-[#003476] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ParliamentBody() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [tab, setTab] = useState<"q" | "leg" | "media">("q");
  const [qs, setQs] = useState<Q[]>([]);
  const [legs, setLegs] = useState<L[]>([]);
  const [qFilter, setQFilter] = useState({ ministry: "", status: "", from: "", to: "" });
  const [legQ, setLegQ] = useState("");
  const [mediaQ, setMediaQ] = useState("Καραγκούνης");
  const [mediaRes, setMediaRes] = useState<MediaItem[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [openQ, setOpenQ] = useState(false);
  const [detail, setDetail] = useState<Q | null>(null);
  const [nQ, setNQ] = useState({ title: "", ministry: "", description: "" });
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadQ = useCallback(async () => {
    const p = new URLSearchParams();
    if (qFilter.ministry) p.set("ministry", qFilter.ministry);
    if (qFilter.status) p.set("status", qFilter.status);
    if (qFilter.from) p.set("date_from", qFilter.from);
    if (qFilter.to) p.set("date_to", qFilter.to);
    const r = await fetchWithTimeout(`/api/parliament/questions?${p.toString()}`);
    const j = (await r.json()) as { questions?: Q[] };
    setQs(j.questions ?? []);
  }, [qFilter]);

  const loadLeg = useCallback(async () => {
    const r = await fetchWithTimeout(`/api/parliament/legislation${legQ ? `?q=${encodeURIComponent(legQ)}` : ""}`);
    const j = (await r.json()) as { items?: L[] };
    setLegs(j.items ?? []);
  }, [legQ]);

  const loadSaved = useCallback(async () => {
    const r = await fetchWithTimeout("/api/media/saved");
    const j = (await r.json()) as { items?: Saved[] };
    setSaved(j.items ?? []);
  }, []);

  useEffect(() => {
    if (!can) return;
    if (tab === "q") void loadQ();
    if (tab === "leg") void loadLeg();
  }, [can, tab, loadQ, loadLeg]);

  useEffect(() => {
    if (can) void loadSaved();
  }, [can, loadSaved]);

  const doMediaSearch = async () => {
    const r = await fetchWithTimeout(`/api/media/search?q=${encodeURIComponent(mediaQ)}`);
    const j = (await r.json()) as { results?: MediaItem[] };
    setMediaRes(j.results ?? []);
  };

  const openDetail = async (q: Q) => {
    const r = await fetchWithTimeout(`/api/parliament/questions/${q.id}`);
    const j = (await r.json()) as { question?: Q; contact?: { first_name: string; last_name: string } | null };
    if (j.question) {
      setDetail({ ...j.question, ...q } as Q);
    }
  };

  if (!can) {
    return <p className="rounded-lg border border-amber-500/30 p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="w-full min-w-0 max-w-6xl space-y-4">
      {toast ? (
        <div
          className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-emerald-500/40 bg-[var(--bg-card)] px-4 py-3 text-sm text-[var(--text-primary)] shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
      <PageHeader
        title="Βουλευτική δραστηριότητα"
        subtitle="Ερωτήσεις, νομοθετικό ιστορικό και παρακολούθηση ΜΜΕ — με πορεία κατάστασης ερωτήσεων."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={lux.btnPrimary + " flex items-center gap-2 !py-2 !text-sm"}
              disabled={syncing}
              onClick={async () => {
                setSyncing(true);
                setToast(null);
                try {
                  const r = await fetchWithTimeout("/api/parliament/sync", { method: "POST", timeoutMs: 120_000 });
                  const j = (await r.json()) as { error?: string; imported?: number; skipped?: number };
                  if (!r.ok) {
                    setToast(j.error || "Σφάλμα συγχρονισμού");
                    return;
                  }
                  setToast(
                    `Συγχρονισμός: εισήχθησαν ${j.imported ?? 0} εγγραφές — παράλειψη ${j.skipped ?? 0} (υπάρχουσα τίτλος).`,
                  );
                  void loadQ();
                  void loadLeg();
                } catch (e) {
                  setToast(e instanceof Error ? e.message : "Σφάλμα");
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <RefreshCw className="h-4 w-4 shrink-0" />}
              Συγχρονισμός Vouliwatch
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--accent-gold)]">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
        }
      />
      <section
        className={
          lux.card + " !p-4 flex flex-col gap-3 sm:flex-row sm:items-start"
        }
        aria-label="Βιογραφικό"
      >
        {MP_BIO.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Hellenic Parliament static URL
          <img
            src={MP_BIO.imageUrl}
            alt={MP_BIO.name}
            className="h-28 w-[5.5rem] shrink-0 rounded-lg border border-[var(--border)] object-cover"
            width={88}
            height={112}
          />
        ) : null}
        <div className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
          <h2 className="text-base font-extrabold text-[var(--text-primary)]">{MP_BIO.name}</h2>
          <p className="text-xs font-semibold text-[#003476]">{MP_BIO.role}</p>
          <p className="text-xs text-[var(--text-muted)]">{MP_BIO.district}</p>
          <p className="mt-2 leading-relaxed">{MP_BIO.intro}</p>
          <p className="mt-2 leading-relaxed">{MP_BIO.studies}</p>
          <p className="mt-2 leading-relaxed">{MP_BIO.activity}</p>
          <p className="mt-2 flex flex-wrap gap-3 text-xs">
            <a
              className="font-medium text-[var(--accent-gold)] hover:underline"
              href={MP_BIO.siteUrl}
              target="_blank"
              rel="noreferrer"
            >
              karagkounis.gr
            </a>
            <a
              className="font-medium text-[#003476] hover:underline"
              href="https://www.hellenicparliament.gr/vouleftes/viografika-stoicheia/?MPId=897f098b-6295-48f2-85a2-b3625386a319"
              target="_blank"
              rel="noreferrer"
            >
              Βιογραφικά (Βουλή)
            </a>
            <a
              className="font-medium text-sky-200 hover:underline"
              href={MP_BIO.vouliwatchUrl}
              target="_blank"
              rel="noreferrer"
            >
              Vouliwatch
            </a>
          </p>
        </div>
      </section>
      <div
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 px-3 py-2 text-[11px] text-[var(--text-muted)]"
        aria-hidden
      >
        <span className="font-semibold text-[var(--accent-gold)]">Πορεία ερώτησης</span>
        <div className="flex flex-1 flex-wrap items-center justify-center gap-1 sm:gap-3">
          {["Κατατέθηκε", "Σε εξέλιξη", "Απαντήθηκε", "Αρχειοθετήθηκε"].map((step, i) => (
            <div key={step} className="flex items-center gap-1 sm:gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-card)] text-[10px] font-bold text-[var(--text-primary)]">
                {i + 1}
              </span>
              <span className="hidden sm:inline">{step}</span>
              {i < 3 ? <span className="text-[var(--border)]">—</span> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <TabBtn active={tab === "q"} onClick={() => setTab("q")}>
          Ερωτήσεις Βουλής
        </TabBtn>
        <TabBtn active={tab === "leg"} onClick={() => setTab("leg")}>
          Νομοθετικό ιστορικό
        </TabBtn>
        <TabBtn active={tab === "media"} onClick={() => setTab("media")}>
          Media monitoring
        </TabBtn>
      </div>

      {tab === "q" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              className={lux.input + " max-w-xs"}
              placeholder="Υπουργείο"
              value={qFilter.ministry}
              onChange={(e) => setQFilter((f) => ({ ...f, ministry: e.target.value }))}
            />
            <select
              className={lux.select + " max-w-[11rem]"}
              value={qFilter.status}
              onChange={(e) => setQFilter((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="">Όλα status</option>
              <option>Κατατέθηκε</option>
              <option>Σε εξέλιξη</option>
              <option>Απαντήθηκε</option>
              <option>Αρχειοθετήθηκε</option>
            </select>
            <input
              className={lux.input + " w-36"}
              type="date"
              value={qFilter.from}
              onChange={(e) => setQFilter((f) => ({ ...f, from: e.target.value }))}
            />
            <input
              className={lux.input + " w-36"}
              type="date"
              value={qFilter.to}
              onChange={(e) => setQFilter((f) => ({ ...f, to: e.target.value }))}
            />
            <button type="button" className={lux.btnPrimary} onClick={() => void loadQ()}>
              Φίλτρο
            </button>
            <button type="button" className={lux.btnSecondary} onClick={() => setOpenQ(true)}>
              Νέα ερώτηση
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className={lux.tableHead}>
                  <th className="p-2 text-left">Τίτλος</th>
                  <th className="p-2">Υπουργείο</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Υποβολή</th>
                  <th className="p-2">Απάντηση</th>
                </tr>
              </thead>
              <tbody>
                {qs.map((q) => (
                  <tr
                    key={q.id}
                    className="cursor-pointer border-t border-[var(--border)] hover:bg-[var(--bg-elevated)]"
                    onClick={() => void openDetail(q)}
                  >
                    <td className="p-2 font-medium">{q.title}</td>
                    <td className="p-2 text-[var(--text-secondary)]">{q.ministry ?? "—"}</td>
                    <td className="p-2">
                      <span
                        className={
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                          (Q_STATUS[q.status] ?? "bg-slate-500/20")
                        }
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="p-2">{q.submitted_date ?? "—"}</td>
                    <td className="p-2">{q.answer_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "leg" && (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                className={lux.input + " pl-8"}
                placeholder="Αναζήτηση τίτλου / αριθμού νόμου"
                value={legQ}
                onChange={(e) => setLegQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void loadLeg()}
              />
            </div>
            <button type="button" className={lux.btnPrimary} onClick={() => void loadLeg()}>
              Αναζήτηση
            </button>
            <NewLegislation onDone={() => void loadLeg()} />
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[800px] text-sm">
              <thead>
                <tr className={lux.tableHead}>
                  <th className="p-2 text-left">Τίτλος</th>
                  <th className="p-2">Ν. αριθμ.</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Ψήφος</th>
                  <th className="p-2">Ημ/νία</th>
                  <th className="p-2">Υπουργείο</th>
                </tr>
              </thead>
              <tbody>
                {legs.map((l) => (
                  <tr key={l.id} className="border-t border-[var(--border)] align-top">
                    <td className="p-2" colSpan={6}>
                      <div className="hq-card-premium !rounded-lg border-l-4 border-l-[#003476] p-3">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                          {l.law_number ? `Ν. ${l.law_number}` : "Νομοθεσία"} · {l.date ?? "—"}
                        </p>
                        <p className="mt-1 text-base font-extrabold leading-snug text-[var(--text-primary)]">{l.title}</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
                          <span>{l.status}</span>
                          {l.vote ? (
                            <span className={"inline-flex rounded-full px-2 py-0.5 " + (VOTE_COL[l.vote] ?? "")}>
                              {l.vote}
                            </span>
                          ) : null}
                          <span>{l.ministry ?? "—"}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "media" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input className={lux.input + " max-w-md flex-1"} value={mediaQ} onChange={(e) => setMediaQ(e.target.value)} />
            <button type="button" className={lux.btnPrimary} onClick={() => void doMediaSearch()}>
              Αναζήτηση
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {mediaRes.map((m) => (
              <div key={m.link} className={lux.card + " !p-4"}>
                <a href={m.link} target="_blank" rel="noreferrer" className="font-medium text-[var(--text-primary)] hover:underline">
                  {m.title}
                </a>
                <p className="text-xs text-[var(--text-muted)]">
                  {m.source} · {m.date}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-4">{m.snippet}</p>
                <button
                  type="button"
                  className="mt-2 text-xs font-semibold text-[var(--accent-gold)]"
                  onClick={async () => {
                    await fetchWithTimeout("/api/media/saved", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        title: m.title,
                        source: m.source,
                        link: m.link,
                        published_at: m.date,
                        snippet: m.snippet,
                        query: mediaQ,
                      }),
                    });
                    void loadSaved();
                  }}
                >
                  Αποθήκευση
                </button>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-semibold">Αποθηκευμένα</h3>
          <ul className="space-y-2 text-sm">
            {saved.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-2 border-b border-[var(--border)] py-1">
                <a href={s.link ?? "#"} className="text-[var(--text-primary)] hover:underline" target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <span className="shrink-0 text-[var(--text-muted)]">
                  {new Date(s.created_at).toLocaleDateString("el-GR")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openQ && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
            <h3 className="font-semibold">Νέα ερώτηση</h3>
            <div className="mt-3 space-y-2">
              <input className={lux.input} placeholder="Τίτλος" value={nQ.title} onChange={(e) => setNQ((q) => ({ ...q, title: e.target.value }))} />
              <input className={lux.input} placeholder="Υπουργείο" value={nQ.ministry} onChange={(e) => setNQ((q) => ({ ...q, ministry: e.target.value }))} />
              <textarea
                className={lux.input + " min-h-[5rem]"}
                placeholder="Περιγραφή"
                value={nQ.description}
                onChange={(e) => setNQ((q) => ({ ...q, description: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={lux.btnSecondary} onClick={() => setOpenQ(false)}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnPrimary}
                onClick={async () => {
                  await fetchWithTimeout("/api/parliament/questions", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(nQ),
                  });
                  setOpenQ(false);
                  setNQ({ title: "", ministry: "", description: "" });
                  void loadQ();
                }}
              >
                Αποθήκευση
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" role="dialog">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-sm">
            <h3 className="text-lg font-semibold">{detail.title}</h3>
            <p className="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{detail.description || "—"}</p>
            {detail.answer_text ? (
              <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <span className="text-xs font-semibold text-[var(--text-muted)]">Απάντηση</span>
                <p className="mt-1 whitespace-pre-wrap">{detail.answer_text}</p>
              </div>
            ) : null}
            <button type="button" className={lux.btnSecondary + " mt-4 w-full"} onClick={() => setDetail(null)}>
              Κλείσιμο
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewLegislation({ onDone }: { onDone: () => void }) {
  const [o, setO] = useState(false);
  const [f, setF] = useState({ title: "", law_number: "", status: "Υπό Εξέταση", vote: "Υπέρ", date: "", ministry: "" });
  if (!o) {
    return (
      <button type="button" className={lux.btnSecondary} onClick={() => setO(true)}>
        Προσθήκη
      </button>
    );
  }
  return (
    <div className="w-full max-w-sm rounded-xl border border-[var(--border)] p-3">
      <input className={lux.input + " mb-1"} placeholder="Τίτλος" value={f.title} onChange={(e) => setF((x) => ({ ...x, title: e.target.value }))} />
      <input
        className={lux.input + " mb-1"}
        placeholder="Ν. αριθμός"
        value={f.law_number}
        onChange={(e) => setF((x) => ({ ...x, law_number: e.target.value }))}
      />
      <select className={lux.select + " mb-1 w-full"} value={f.vote} onChange={(e) => setF((x) => ({ ...x, vote: e.target.value }))}>
        {["Υπέρ", "Κατά", "Απών"].map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
      <input className={lux.input + " mb-1"} type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} />
      <div className="mt-1 flex gap-1">
        <button
          type="button"
          className={lux.btnPrimary + " flex-1 !py-1.5 text-xs"}
          onClick={async () => {
            await fetchWithTimeout("/api/parliament/legislation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(f),
            });
            setO(false);
            onDone();
          }}
        >
          OK
        </button>
        <button type="button" className={lux.btnSecondary} onClick={() => setO(false)}>
          Άκυρο
        </button>
      </div>
    </div>
  );
}

export default function ParliamentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>}>
      <ParliamentBody />
    </Suspense>
  );
}
