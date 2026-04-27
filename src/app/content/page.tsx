"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Copy, Download, Printer, Sparkles } from "lucide-react";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

const MINISTRIES = [
  "Υπουργείο Υγείας",
  "Υπουργείο Παιδείας, Θρησκευμάτων και Αθλητισμού",
  "Υπουργείο Υποδομών και Μεταφορών",
  "Υπουργείο Εσωτερικών",
  "Υπουργείο Ανάπτυξης",
  "Υπουργείο Περιβάλλοντος και Ενέργειας",
  "Υπουργείο Εργασίας",
  "Άλλο",
] as const;

type Tab = "letters" | "press" | "social";

type LetterItem = {
  id: string;
  recipient: string;
  subject: string;
  content: string;
  citizen_name: string | null;
  created_at: string;
};

type PressItem = {
  id: string;
  title: string;
  content: string;
  tone: string;
  created_at: string;
};

type SocialItem = {
  id: string;
  platform: string | null;
  topic: string | null;
  content: string;
  created_at: string;
};

function seedAlexandra(kind: "letters" | "press" | "social") {
  try {
    sessionStorage.setItem("alexandraContentFocus", kind);
  } catch {
    /* ignore */
  }
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ContentBody() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const sp = useSearchParams();
  const initTab = (sp.get("tab") as Tab) || "letters";
  const [tab, setTab] = useState<Tab>(
    initTab === "press" || initTab === "social" || initTab === "letters" ? initTab : "letters",
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [listLoad, setListLoad] = useState(false);

  const [letterItems, setLetterItems] = useState<LetterItem[]>([]);
  const [pressItems, setPressItems] = useState<PressItem[]>([]);
  const [socialItems, setSocialItems] = useState<SocialItem[]>([]);

  const [pressTopic, setPressTopic] = useState("");
  const [pressPoints, setPressPoints] = useState<string[]>([""]);
  const [pressTone, setPressTone] = useState("Επίσημο");
  const [pressOut, setPressOut] = useState("");

  const [socialTopic, setSocialTopic] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("facebook");
  const [socialTone, setSocialTone] = useState("Επίσημο");
  const [socialTags, setSocialTags] = useState(false);
  const [socialOut, setSocialOut] = useState("");

  const [letterMin, setLetterMin] = useState<string>(MINISTRIES[0]!);
  const [letterTo, setLetterTo] = useState("");
  const [letterSubj, setLetterSubj] = useState("");
  const [letterIssue, setLetterIssue] = useState("");
  const [letterCitizen, setLetterCitizen] = useState("");
  const [letterType, setLetterType] = useState("αίτηση");
  const [letterOut, setLetterOut] = useState("");

  useEffect(() => {
    const t = sp.get("tab");
    if (t === "letters" || t === "social" || t === "press") {
      setTab(t);
    }
  }, [sp]);

  useEffect(() => {
    if (tab !== "letters") return;
    try {
      const raw = sessionStorage.getItem("contentLetterContext");
      if (!raw) return;
      const c = JSON.parse(raw) as { summary?: string; key_points?: string[] };
      sessionStorage.removeItem("contentLetterContext");
      if (c.summary) {
        setLetterIssue((prev) => (prev ? prev : `Σχετικά με το αναλυθέν έγγραφο:\n\n${c.summary}\n`));
      }
      if (c.key_points && c.key_points.length > 0) {
        setLetterIssue(
          (prev) => `${prev || ""}\nΚύρια σημεία:\n${c.key_points!.map((x) => `• ${x}`).join("\n")}\n`,
        );
      }
    } catch {
      /* ignore */
    }
  }, [tab]);

  const loadLists = useCallback(async () => {
    setListLoad(true);
    setErr(null);
    try {
      const [rL, rP, rS] = await Promise.all([
        fetchWithTimeout("/api/letters/saved"),
        fetchWithTimeout("/api/press-releases"),
        fetchWithTimeout("/api/content/social-saved"),
      ]);
      if (rL.ok) {
        const j = (await rL.json()) as { items?: LetterItem[] };
        setLetterItems(j.items ?? []);
      }
      if (rP.ok) {
        const j = (await rP.json()) as { items?: PressItem[] };
        setPressItems(j.items ?? []);
      }
      if (rS.ok) {
        const j = (await rS.json()) as { items?: SocialItem[] };
        setSocialItems(j.items ?? []);
      }
    } catch {
      setErr("Σφάλμα φόρτωσης λιστών");
    } finally {
      setListLoad(false);
    }
  }, []);

  useEffect(() => {
    if (!can) return;
    void loadLists();
  }, [can, loadLists]);

  const copy = (s: string) => {
    void navigator.clipboard.writeText(s);
  };

  const genPress = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "press_release",
          params: { topic: pressTopic, key_points: pressPoints.filter(Boolean), tone: pressTone },
        }),
      });
      const j = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setPressOut(j.content ?? "");
    } catch {
      setErr("Σφάλμα");
    } finally {
      setBusy(false);
    }
  }, [pressPoints, pressTone, pressTopic]);

  const savePress = async () => {
    if (!pressOut) return;
    const res = await fetchWithTimeout("/api/press-releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: pressTopic, content: pressOut, tone: pressTone }),
    });
    if (res.ok) {
      void loadLists();
    }
  };

  const genSocial = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "social_post",
          params: { topic: socialTopic, platform: socialPlatform, tone: socialTone, include_hashtags: socialTags },
        }),
      });
      const j = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setSocialOut(j.content ?? "");
    } catch {
      setErr("Σφάλμα");
    } finally {
      setBusy(false);
    }
  }, [socialPlatform, socialTags, socialTone, socialTopic]);

  const saveSocial = async () => {
    if (!socialOut?.trim()) return;
    const res = await fetchWithTimeout("/api/content/social-saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: socialPlatform, topic: socialTopic, content: socialOut }),
    });
    if (res.ok) {
      setSocialOut("");
      void loadLists();
    }
  };

  const genLetter = useCallback(async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/content/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "letter",
          params: {
            recipient_ministry: letterMin,
            recipient: letterTo,
            subject: letterSubj,
            issue_description: letterIssue,
            citizen_name: letterCitizen,
            letter_type: letterType,
          },
        }),
      });
      const j = (await res.json()) as { content?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setLetterOut(j.content ?? "");
    } catch {
      setErr("Σφάλμα");
    } finally {
      setBusy(false);
    }
  }, [letterCitizen, letterIssue, letterMin, letterSubj, letterTo, letterType]);

  const saveLetter = async () => {
    if (!letterOut) return;
    const res = await fetchWithTimeout("/api/letters/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: `${letterMin}${letterTo ? ` — ${letterTo}` : ""}`,
        subject: letterSubj,
        content: letterOut,
        citizen_name: letterCitizen || null,
      }),
    });
    if (res.ok) {
      void loadLists();
    }
  };

  const delSocial = async (id: string) => {
    if (!confirm("Διαγραφή αυτού του post;")) return;
    const res = await fetchWithTimeout(`/api/content/social-saved?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) {
      void loadLists();
    }
  };

  if (!can) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="w-full min-w-0 max-w-5xl space-y-4">
      <h1 className={lux.pageTitle}>Περιεχόμενο</h1>
      <p className="text-sm text-[var(--text-secondary)]">Αποθηκευμένα κείμενα, γρήγορη παραγωγή, και σύνδεση με την Alexandra.</p>
      {err && <p className="text-sm text-red-300">{err}</p>}

      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
        {(
          [
            { id: "letters" as const, label: "Επιστολές" },
            { id: "press" as const, label: "Ανακοινώσεις Τύπου" },
            { id: "social" as const, label: "Social Posts" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              tab === t.id
                ? "bg-[#003476] text-white"
                : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "letters" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Αποθηκευμένες επιστολές</h2>
            <Link
              href="/alexandra"
              onClick={() => seedAlexandra("letters")}
              className={lux.btnPrimary + " inline-flex items-center gap-1.5"}
            >
              <Sparkles className="h-4 w-4" />
              Δημιουργία
            </Link>
          </div>
          {listLoad && <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>}
          {letterItems.length === 0 && !listLoad && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40 px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              Δεν υπάρχουν ακόμα αποθηκευμένες επιστολές. Χρησιμοποιήστε «Δημιουργία» για την Alexandra ή τη γρήγορη παρακάτω.
            </p>
          )}
          <ul className="grid gap-3 sm:grid-cols-1">
            {letterItems.map((it) => (
              <li key={it.id} className="data-hq-card rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--text-muted)]">Προς</p>
                    <p className="font-semibold text-[var(--text-primary)]">{it.recipient || "—"}</p>
                    {it.citizen_name ? (
                      <p className="text-xs text-[var(--text-secondary)]">Πολίτης: {it.citizen_name}</p>
                    ) : null}
                    <p className="mt-1 text-sm font-bold text-[var(--text-primary)]">{it.subject || "—"}</p>
                    <p className="text-xs text-[var(--text-muted)]">{new Date(it.created_at).toLocaleString("el-GR")}</p>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                      {it.content || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <button
                      type="button"
                      className={lux.btnSecondary + " !px-2.5 !py-1.5 !text-xs inline-flex items-center gap-1"}
                      onClick={() => copy(it.content)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Αντιγραφή
                    </button>
                    <button
                      type="button"
                      className={lux.btnSecondary + " !px-2.5 !py-1.5 !text-xs inline-flex items-center gap-1"}
                      onClick={() =>
                        downloadText(
                          `${(it.subject || "epistoli").replace(/[^\w\s-]/g, "").slice(0, 40)}.txt`,
                          it.content,
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      Λήψη
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <details className="data-hq-card group rounded-2xl p-4 open:ring-1 open:ring-[#C9A84C]/30">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text-primary)] group-open:mb-3">
              Γρήγορη δημιουργία επιστολής (API)
            </summary>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={lux.label}>Υπουργείο</label>
                <select className={lux.select} value={letterMin} onChange={(e) => setLetterMin(e.target.value)}>
                  {MINISTRIES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lux.label}>Όνομα / Θέμα παραλήπτη (προαιρετικό)</label>
                <input className={lux.input} value={letterTo} onChange={(e) => setLetterTo(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={lux.label}>Θέμα</label>
                <input className={lux.input} value={letterSubj} onChange={(e) => setLetterSubj(e.target.value)} />
              </div>
              <div>
                <label className={lux.label}>Όνομα πολίτη (προαιρετικό)</label>
                <input className={lux.input} value={letterCitizen} onChange={(e) => setLetterCitizen(e.target.value)} />
              </div>
              <div>
                <label className={lux.label}>Τύπος εγγράφου</label>
                <input className={lux.input} value={letterType} onChange={(e) => setLetterType(e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className={lux.label}>Περιγραφή ζητήματος</label>
                <textarea
                  className={lux.input + " min-h-[6rem]"}
                  value={letterIssue}
                  onChange={(e) => setLetterIssue(e.target.value)}
                />
              </div>
              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button type="button" className={lux.btnPrimary} disabled={busy} onClick={() => void genLetter()}>
                  {busy ? "…" : "Δημιουργία"}
                </button>
                <button type="button" className={lux.btnSecondary} disabled={!letterOut} onClick={() => void saveLetter()}>
                  Αποθήκευση
                </button>
              </div>
            </div>
            <div
              id="letter-print-area"
              className="prose-article mt-4 min-h-[8rem] max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-6 text-sm leading-relaxed text-[var(--text-primary)] [print-border:none] print:bg-white"
            >
              {letterOut ? <pre className="whitespace-pre-wrap font-sans">{letterOut}</pre> : "—"}
            </div>
            {letterOut && (
              <button
                type="button"
                className={lux.btnSecondary + " mt-3 inline-flex items-center gap-1"}
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Εκτύπωση / PDF
              </button>
            )}
          </details>
        </div>
      )}

      {tab === "press" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Αποθηκευμένες ανακοινώσεις</h2>
            <Link
              href="/alexandra"
              onClick={() => seedAlexandra("press")}
              className={lux.btnPrimary + " inline-flex items-center gap-1.5"}
            >
              <Sparkles className="h-4 w-4" />
              Δημιουργία
            </Link>
          </div>
          {pressItems.length === 0 && !listLoad && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40 px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              Δεν υπάρχουν ακόμα αποθηκευμένες ανακοινώσεις.
            </p>
          )}
          <ul className="grid gap-3">
            {pressItems.map((it) => (
              <li key={it.id} className="data-hq-card rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-[var(--text-primary)]">{it.title || "—"}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {it.tone ? `${it.tone} · ` : ""}
                      {new Date(it.created_at).toLocaleString("el-GR")}
                    </p>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                      {it.content || "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <button
                      type="button"
                      className={lux.btnSecondary + " !px-2.5 !py-1.5 !text-xs inline-flex items-center gap-1"}
                      onClick={() => copy(it.content)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Αντιγραφή
                    </button>
                    <button
                      type="button"
                      className={lux.btnSecondary + " !px-2.5 !py-1.5 !text-xs inline-flex items-center gap-1"}
                      onClick={() =>
                        downloadText(
                          `${(it.title || "anakoinwsi").replace(/[^\w\s-]/g, "").slice(0, 40)}.txt`,
                          it.content,
                        )
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      Λήψη
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <details className="data-hq-card group rounded-2xl p-4 open:ring-1 open:ring-[#C9A84C]/30">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text-primary)] group-open:mb-3">
              Γρήγορη δημιουργία (API)
            </summary>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className={lux.label}>Θέμα</label>
                <input className={lux.input} value={pressTopic} onChange={(e) => setPressTopic(e.target.value)} />
                <label className={lux.label}>Τόνος</label>
                <select className={lux.select} value={pressTone} onChange={(e) => setPressTone(e.target.value)}>
                  <option>Επίσημο</option>
                  <option>Φιλικό</option>
                  <option>Επείγον</option>
                </select>
                <p className="text-xs text-[var(--text-muted)]">Κύρια σημεία</p>
                {pressPoints.map((p, i) => (
                  <input
                    key={i}
                    className={lux.input + " mb-1"}
                    value={p}
                    onChange={(e) => {
                      const n = [...pressPoints];
                      n[i] = e.target.value;
                      setPressPoints(n);
                    }}
                    placeholder={`Σημείο ${i + 1}`}
                  />
                ))}
                <button
                  type="button"
                  className={lux.btnSecondary + " !text-xs"}
                  onClick={() => setPressPoints((x) => [...x, ""])}
                >
                  + Σημείο
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={lux.btnPrimary}
                    disabled={busy}
                    onClick={() => void genPress()}
                  >
                    {busy ? "…" : "Δημιουργία"}
                  </button>
                  <button type="button" className={lux.btnSecondary} disabled={!pressOut} onClick={() => void savePress()}>
                    Αποθήκευση
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--text-muted)]">Προεπισκόπηση</span>
                  {pressOut && (
                    <button type="button" className={lux.btnIcon} title="Αντιγραφή" onClick={() => copy(pressOut)}>
                      <Copy className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="min-h-[16rem] whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 text-sm text-[var(--text-primary)]">
                  {pressOut || "—"}
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {tab === "social" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">Social posts (αποθηκευμένα)</h2>
            <Link
              href="/alexandra"
              onClick={() => seedAlexandra("social")}
              className={lux.btnPrimary + " inline-flex items-center gap-1.5"}
            >
              <Sparkles className="h-4 w-4" />
              Δημιουργία
            </Link>
          </div>
          {socialItems.length === 0 && !listLoad && (
            <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-elevated)]/40 px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
              Δεν υπάρχουν ακόμα αποθηκευμένα social posts.
            </p>
          )}
          <ul className="grid gap-3">
            {socialItems.map((it) => (
              <li key={it.id} className="data-hq-card rounded-2xl p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase text-[#C9A84C]">{it.platform || "—"}</p>
                    {it.topic ? <p className="text-sm font-bold text-[var(--text-primary)]">{it.topic}</p> : null}
                    <p className="text-xs text-[var(--text-muted)]">{new Date(it.created_at).toLocaleString("el-GR")}</p>
                    <p className="mt-2 line-clamp-6 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
                      {it.content}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:items-start">
                    <button
                      type="button"
                      className={lux.btnSecondary + " !px-2.5 !py-1.5 !text-xs inline-flex items-center gap-1"}
                      onClick={() => copy(it.content)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Αντιγραφή
                    </button>
                    <button
                      type="button"
                      className={lux.btnSecondary + " !px-2.5 !py-1.5 !text-xs inline-flex items-center gap-1"}
                      onClick={() =>
                        downloadText(`social-${it.id.slice(0, 8)}.txt`, it.content)
                      }
                    >
                      <Download className="h-3.5 w-3.5" />
                      Λήψη
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200"
                      onClick={() => void delSocial(it.id)}
                    >
                      Διαγραφή
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <details className="data-hq-card group rounded-2xl p-4 open:ring-1 open:ring-[#C9A84C]/30">
            <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--text-primary)] group-open:mb-3">
              Γρήγορη δημιουργία social (API) και αποθήκευση
            </summary>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className={lux.label}>Θέμα</label>
                <input className={lux.input} value={socialTopic} onChange={(e) => setSocialTopic(e.target.value)} />
                <label className={lux.label}>Πλατφόρμα</label>
                <select className={lux.select} value={socialPlatform} onChange={(e) => setSocialPlatform(e.target.value)}>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                </select>
                <label className={lux.label}>Τόνος</label>
                <select className={lux.select} value={socialTone} onChange={(e) => setSocialTone(e.target.value)}>
                  <option>Επίσημο</option>
                  <option>Φιλικό</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={socialTags} onChange={(e) => setSocialTags(e.target.checked)} />
                  Hashtags
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={lux.btnPrimary} disabled={busy} onClick={() => void genSocial()}>
                    {busy ? "…" : "Δημιουργία"}
                  </button>
                  <button
                    type="button"
                    className={lux.btnSecondary}
                    disabled={!socialOut}
                    onClick={() => void saveSocial()}
                  >
                    Αποθήκευση
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">Χαρακτήρες: {socialOut.length}</p>
                <div className="min-h-[12rem] max-w-md whitespace-pre-wrap rounded-lg border-2 border-[#1877f2]/30 bg-white p-4 text-[#050505]">
                  {socialOut || "Προεπισκόπηση post…"}
                </div>
              </div>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

export default function ContentPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>}>
      <ContentBody />
    </Suspense>
  );
}
