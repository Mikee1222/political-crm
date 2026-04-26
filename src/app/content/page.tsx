"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Copy, Printer } from "lucide-react";
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

type Tab = "press" | "social" | "letters";

function ContentBody() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const sp = useSearchParams();
  const initTab = (sp.get("tab") as Tab) || "press";
  const [tab, setTab] = useState<Tab>(initTab === "letters" || initTab === "social" ? initTab : "press");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    await fetchWithTimeout("/api/press-releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: pressTopic, content: pressOut, tone: pressTone }),
    });
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
    await fetchWithTimeout("/api/letters/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: `${letterMin}${letterTo ? ` — ${letterTo}` : ""}`,
        subject: letterSubj,
        content: letterOut,
        citizen_name: letterCitizen || null,
      }),
    });
  };

  if (!can) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="w-full min-w-0 max-w-4xl space-y-4">
      <h1 className={lux.pageTitle}>Περιεχόμενο</h1>
      {err && <p className="text-sm text-red-300">{err}</p>}

      <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        {(
          [
            { id: "press" as const, label: "Ανακοινώσεις" },
            { id: "social" as const, label: "Social Media" },
            { id: "letters" as const, label: "Επιστολές" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={[
              "rounded-lg px-4 py-2 text-sm font-semibold",
              tab === t.id
                ? "bg-[#003476] text-white"
                : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "press" && (
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
            <button
              type="button"
              className={lux.btnPrimary + " mt-2 block w-full sm:w-auto"}
              disabled={busy}
              onClick={() => void genPress()}
            >
              {busy ? "…" : "Δημιουργία"}
            </button>
            <button type="button" className={lux.btnSecondary} disabled={!pressOut} onClick={() => void savePress()}>
              Αποθήκευση
            </button>
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
      )}

      {tab === "social" && (
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
            <button type="button" className={lux.btnPrimary} disabled={busy} onClick={() => void genSocial()}>
              {busy ? "…" : "Δημιουργία"}
            </button>
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)]">Χαρακτήρες: {socialOut.length}</p>
            <div className="min-h-[12rem] max-w-md whitespace-pre-wrap rounded-lg border-2 border-[#1877f2]/30 bg-white p-4 text-[#050505]">
              {socialOut || "Προεπισκόπηση post…"}
            </div>
            {socialOut && (
              <button type="button" className={lux.btnSecondary + " mt-2 inline-flex items-center gap-1"} onClick={() => copy(socialOut)}>
                <Copy className="h-4 w-4" />
                Αντιγραφή
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "letters" && (
        <div>
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
            className="prose-article mt-6 min-h-[12rem] max-w-3xl rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-8 text-sm leading-relaxed text-[var(--text-primary)] [print-border:none] print:bg-white"
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
