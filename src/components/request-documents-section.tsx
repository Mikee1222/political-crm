"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Trash2 } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
type DocRow = {
  id: string;
  name: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  signed_url: string | null;
};

const card = "rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5";

export function RequestDocumentsSection({ requestId, canManage }: { requestId: string; canManage: boolean }) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) return;
    const r = await fetchWithTimeout(`/api/documents?request_id=${requestId}`);
    if (r.ok) {
      const j = (await r.json()) as { documents?: DocRow[] };
      setDocs(j.documents ?? []);
    }
  }, [canManage, requestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const fd = new FormData();
    fd.set("file", f);
    fd.set("request_id", requestId);
    const res = await fetchWithTimeout("/api/documents/upload", { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (res.ok) {
      void load();
    }
  };

  const del = async (docId: string) => {
    if (!confirm("Διαγραφή;")) return;
    await fetchWithTimeout(`/api/documents/${docId}`, { method: "DELETE" });
    void load();
  };

  if (!canManage) {
    return null;
  }

  return (
    <section className={card} aria-label="Έγγραφα αιτήματος">
      <h2 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Έγγραφα</h2>
      <label className="mb-3 inline-flex cursor-pointer text-xs text-[#003476]">
        <input type="file" className="hidden" onChange={(e) => void upload(e)} disabled={uploading} />
        <span className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5">
          {uploading ? "Μεταφόρτωση…" : "Ανέβασμα εγγράφου"}
        </span>
      </label>
      <ul className="space-y-2">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-primary)]">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">{d.name}</span>
            </span>
            <div className="flex gap-1">
              {d.signed_url ? (
                <a href={d.signed_url} target="_blank" rel="noreferrer" className="p-1.5 text-[#003476]" title="Λήψη">
                  <Download className="h-4 w-4" />
                </a>
              ) : null}
              <button type="button" onClick={() => void del(d.id)} className="p-1.5 text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
