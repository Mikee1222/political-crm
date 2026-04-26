"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, Save } from "lucide-react";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type Analysis = {
  title: string;
  summary: string;
  key_points: string[];
  relevance_to_aitoloakarnania: string;
  recommended_actions: string[];
  sentiment: string;
  analysis?: Record<string, unknown>;
};

type DocRow = {
  id: string;
  title: string | null;
  content_summary: string | null;
  key_points: unknown;
  analysis: unknown;
  created_at: string;
};

export default function DocumentsPage() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const router = useRouter();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("Έγγραφο");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [history, setHistory] = useState<DocRow[]>([]);
  const [drag, setDrag] = useState(false);

  const loadHistory = useCallback(async () => {
    const res = await fetchWithTimeout("/api/documents/history");
    if (!res.ok) return;
    const j = (await res.json()) as { documents?: DocRow[] };
    setHistory(j.documents ?? []);
  }, []);

  useEffect(() => {
    if (can) void loadHistory();
  }, [can, loadHistory]);

  const extractPdf = async (f: File) => {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const res = await fetchWithTimeout("/api/contacts/extract-pdf", { method: "POST", body: fd });
      const j = (await res.json()) as { text?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα PDF");
        return;
      }
      setText((j.text ?? "").trim() || text);
      if (f.name) {
        setTitle(f.name.replace(/\.pdf$/i, ""));
      }
    } catch {
      setErr("Σφάλμα ανάγνωσης");
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.name.toLowerCase().endsWith(".pdf")) {
      void extractPdf(f);
    } else if (f && f.type.startsWith("text/")) {
      f.text().then((t) => setText(t)).catch(() => setErr("Άνοιγμα αρχείου"));
    }
  };

  const analyze = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title }),
      });
      const j = (await res.json()) as Analysis & { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        setResult(null);
        return;
      }
      setResult(j);
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setBusy(false);
    }
  };

  const saveAnalysis = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const res = await fetchWithTimeout("/api/documents/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title || title,
          content_summary: result.summary,
          key_points: result.key_points,
          analysis: {
            ...result,
            ...result.analysis,
            sentiment: result.sentiment,
          },
        }),
      });
      if (!res.ok) {
        setErr("Αποτυχία αποθήκευσης");
        return;
      }
      void loadHistory();
    } finally {
      setBusy(false);
    }
  };

  const openLetter = () => {
    if (!result) return;
    const ctx = {
      fromDocument: true,
      summary: result.summary,
      key_points: result.key_points,
      relevance: result.relevance_to_aitoloakarnania,
    };
    try {
      sessionStorage.setItem("contentLetterContext", JSON.stringify(ctx));
    } catch {
      /* ignore */
    }
    router.push("/content?tab=letters");
  };

  if (!can) {
    return <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Δεν έχετε πρόσβαση.</p>;
  }

  return (
    <div className="grid min-h-0 w-full min-w-0 max-w-6xl gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h1 className={lux.pageTitle}>Έγγραφα</h1>
        <p className="text-sm text-[var(--text-secondary)]">Ανέβασμα PDF ή επικόλληση κειμένου — ανάλυση με τεχνητή νοημοσύνη.</p>

        <div
          className={[
            "flex min-h-[8rem] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 transition-colors",
            drag ? "border-[var(--accent-gold)] bg-[var(--bg-elevated)]" : "border-[var(--border)]",
          ].join(" ")}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            onFiles(e.dataTransfer.files);
          }}
        >
          <FileUp className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
          <p className="text-center text-sm text-[var(--text-secondary)]">Σύρετε PDF ή .txt εδώ</p>
          <input
            type="file"
            className="mt-3 text-xs"
            accept=".pdf,.txt"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        <div>
          <label className={lux.label} htmlFor="doc-title">Τίτλος</label>
          <input id="doc-title" className={lux.input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className={lux.label} htmlFor="doc-body">Κείμενο</label>
          <textarea
            id="doc-body"
            className={lux.input + " min-h-[12rem] font-mono text-sm leading-relaxed"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Επικόλληση περιεχομένου νόμου, ΦΕΚ, άρθρου…"
          />
        </div>
        <button type="button" className={lux.btnPrimary} disabled={busy || !text.trim()} onClick={() => void analyze()}>
          {busy ? "Ανάλυση…" : "Ανάλυση εγγράφου"}
        </button>
        {err && <p className="text-sm text-red-300">{err}</p>}
      </div>

      <div className="space-y-3">
        {result && (
          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <h2 className={lux.sectionTitle + " !mb-0"}>Αποτέλεσμα</h2>
            <div className="rounded-lg bg-[var(--bg-elevated)]/80 p-3 text-sm text-[var(--text-primary)]">
              <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">Περίληψη</p>
              <p className="mt-1 whitespace-pre-wrap">{result.summary}</p>
            </div>
            {result.key_points?.length ? (
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)]">Κύρια σημεία</p>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-primary)]">
                  {result.key_points.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <p className="text-xs font-semibold text-[var(--text-muted)]">Σχέση με Αιτωλοακαρνανία</p>
              <p className="text-sm text-[var(--text-primary)]">{result.relevance_to_aitoloakarnania}</p>
            </div>
            {result.recommended_actions?.length ? (
              <div>
                <p className="text-xs font-semibold text-[var(--text-muted)]">Προτεινόμενες ενέργειες</p>
                <ul className="mt-1 list-inside list-disc text-sm">
                  {result.recommended_actions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-sm">
              <span className="text-[var(--text-muted)]">Συναίσθημα: </span>
              <span className="font-medium text-[var(--text-primary)]">{result.sentiment}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={lux.btnSecondary + " inline-flex items-center gap-1"}
                onClick={() => void saveAnalysis()}
                disabled={busy}
              >
                <Save className="h-4 w-4" />
                Αποθήκευση ανάλυσης
              </button>
              <button type="button" className={lux.btnPrimary} onClick={openLetter} disabled={busy}>
                Σύνταξη απάντησης (επιστολή)
              </button>
            </div>
          </div>
        )}

        <div>
          <h2 className={lux.sectionTitle}>Πρόσφατα</h2>
          <ul className="space-y-2">
            {history.map((d) => (
              <li key={d.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                <p className="font-medium text-[var(--text-primary)]">{d.title || "Άνευ τίτλου"}</p>
                <p className="line-clamp-2 text-xs text-[var(--text-secondary)]">
                  {d.content_summary || "—"} · {new Date(d.created_at).toLocaleString("el-GR")}
                </p>
              </li>
            ))}
          </ul>
          {history.length === 0 && <p className="text-sm text-[var(--text-muted)]">Καμία αποθηκευμένη ανάλυση.</p>}
        </div>

        <Link href="/content" className={lux.btnSecondary + " inline-block"}>
          Περιεχόμενο (ανακοινώσεις)
        </Link>
      </div>
    </div>
  );
}
