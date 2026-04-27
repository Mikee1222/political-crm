"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, QrCode, Trash2, Wand2 } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type DocRow = {
  id: string;
  name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  signed_url: string | null;
};

type ApptRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  citizen_name: string | null;
};

const card =
  "contact-card-in break-inside-avoid rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)]/95 p-5 shadow-sm";

export function ContactExtraSections({
  contactId,
  phone,
  canManage,
}: {
  contactId: string;
  phone: string | null;
  canManage: boolean;
}) {
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [appts, setAppts] = useState<ApptRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) return;
    try {
      const [dr, ar, ai] = await Promise.all([
        fetchWithTimeout(`/api/documents?contact_id=${encodeURIComponent(contactId)}`),
        fetchWithTimeout(`/api/contacts/${encodeURIComponent(contactId)}/appointments`),
        fetchWithTimeout(`/api/contacts/${encodeURIComponent(contactId)}/ai-summary`),
      ]);
      if (dr.ok) {
        try {
          const j = (await dr.json()) as { documents?: DocRow[] };
          setDocs(j.documents ?? []);
        } catch {
          setDocs([]);
        }
      }
      if (ar.ok) {
        try {
          const j = (await ar.json()) as { appointments?: ApptRow[] };
          setAppts(j.appointments ?? []);
        } catch {
          setAppts([]);
        }
      } else {
        setAppts([]);
      }
      if (ai.ok) {
        try {
          const j = (await ai.json()) as { summary?: string | null };
          setAiSummary(j.summary ?? null);
        } catch {
          setAiSummary(null);
        }
      } else {
        setAiSummary(null);
      }
    } catch {
      setDocs([]);
      setAppts([]);
      setAiSummary(null);
    }
  }, [canManage, contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAi = async () => {
    setAiLoading(true);
    const res = await fetchWithTimeout(`/api/contacts/${contactId}/ai-summary`, { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
    setAiLoading(false);
    if (res.ok && j.summary) {
      setAiSummary(j.summary);
    }
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", f);
    fd.set("contact_id", contactId);
    const res = await fetchWithTimeout("/api/documents/upload", { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (res.ok) {
      void load();
    }
  };

  const delDoc = async (id: string) => {
    if (!confirm("Διαγραφή εγγράφου;")) return;
    await fetchWithTimeout(`/api/documents/${id}`, { method: "DELETE" });
    void load();
  };

  if (!canManage) {
    return null;
  }

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const regUrl = `${base}/portal/register?contact=${encodeURIComponent(contactId)}&phone=${encodeURIComponent(phone ?? "")}`;
  const qrSrc = `/api/qrcode?url=${encodeURIComponent(regUrl)}&size=240`;

  return (
    <div className="col-span-full flex flex-col gap-4">
      <div
        className="rounded-2xl border-2 border-[#C9A84C] bg-[var(--bg-card)]/90 p-4 shadow-sm"
        style={{ boxShadow: "0 0 0 1px color-mix(in srgb, #C9A84C 35%, transparent)" }}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">AI Σύνοψη</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void runAi()}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9A84C]/50 bg-[#C9A84C]/10 px-2.5 py-1.5 text-xs font-medium text-[var(--accent-gold)]"
            >
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              AI Σύνοψη
            </button>
            <button
              type="button"
              onClick={() => setQrOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
            >
              <QrCode className="h-3.5 w-3.5" />
              QR
            </button>
          </div>
        </div>
        {aiSummary ? <p className="text-sm leading-relaxed text-[var(--text-primary)]">{aiSummary}</p> : <p className="text-sm text-[var(--text-muted)]">Πατήστε για παραγωγή σύνοψης.</p>}
      </div>

      <div className={card + " !border-l-[#003476]"}>
        <h2 className="mb-3 text-sm font-semibold">Ραντεβού (portal)</h2>
        {appts.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Δεν υπάρχουν καταχωρήσεις.</p> : null}
        <ul className="space-y-2">
          {appts.map((a) => (
            <li key={a.id} className="text-sm text-[var(--text-secondary)]">
              {new Date(a.starts_at).toLocaleString("el-GR", { timeZone: "Europe/Athens" })} – {a.reason || "—"}
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold">Έγγραφα</h2>
        <div className="mb-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[#003476]">
            <input type="file" className="hidden" onChange={(e) => void upload(e)} disabled={uploading} />
            <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5">
              {uploading ? "Μεταφόρτωση…" : "Ανέβασμα εγγράφου"}
            </span>
          </label>
        </div>
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-primary)]">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate">{d.name}</span>
                {d.file_size != null ? (
                  <span className="text-xs text-[var(--text-muted)]">({Math.round(d.file_size / 1024)} KB)</span>
                ) : null}
              </span>
              <div className="flex gap-1">
                {d.signed_url ? (
                  <a
                    href={d.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-[#003476]"
                    title="Λήψη/προβολή"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                ) : null}
                <button type="button" className="p-1.5 text-red-400" onClick={() => void delDoc(d.id)} title="Διαγραφή">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {qrOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" role="dialog">
          <div className={lux.card + " max-w-sm"}>
            <p className="mb-3 text-center text-sm">Σκανάρετε για εγγραφή portal</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="" className="mx-auto h-48 w-48" />
            <button type="button" className={lux.btnSecondary + " mt-3 w-full"} onClick={() => setQrOpen(false)}>
              Κλείσιμο
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
