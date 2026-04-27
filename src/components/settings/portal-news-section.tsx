"use client";

import { useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";

type Post = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  published_at: string | null;
  category: string;
  excerpt: string | null;
  cover_image: string | null;
  content?: string;
  created_at: string;
  updated_at: string;
};

const empty: Post = {
  id: "",
  title: "",
  slug: "",
  published: false,
  published_at: null,
  category: "Ανακοίνωση",
  excerpt: null,
  cover_image: null,
  content: "",
  created_at: "",
  updated_at: "",
};

export function PortalNewsSection() {
  const [list, setList] = useState<Post[] | null>(null);
  const [editor, setEditor] = useState<Post | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/news-posts");
    if (!res.ok) return;
    const j = (await res.json()) as { posts: Post[] };
    setList(j.posts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setErr("");
    setEditor({ ...empty, id: "new" });
  };

  const openEdit = async (id: string) => {
    setErr("");
    const res = await fetchWithTimeout(`/api/news-posts/${id}`);
    if (!res.ok) {
      setErr("Σφάλμα");
      return;
    }
    const j = (await res.json()) as { post: Post & { content: string } };
    setEditor({ ...j.post, content: j.post.content });
  };

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Νέα & ανακοινώσεις (portal)</h2>
          <p className="text-sm text-[var(--text-secondary)]">Δημοσίευση στο /portal (δημόσια, δημόσια άρθρα)</p>
        </div>
        <button type="button" className={lux.btnPrimary} onClick={openNew}>
          Νέα δημοσίευση
        </button>
      </div>
      {err && (
        <p className="mb-2 text-sm text-amber-200" role="status">
          {err}
        </p>
      )}
      {list === null ? (
        <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
                <th className="p-2 pl-3 text-left">Τίτλος</th>
                <th className="p-2">Κατηγορία</th>
                <th className="p-2">Κατάσταση</th>
                <th className="p-2">Ημ/νία</th>
                <th className="p-2 pr-3">Ενέργεια</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="p-2 pl-3 font-medium">{p.title}</td>
                  <td className="p-2 text-[var(--text-secondary)]">{p.category}</td>
                  <td className="p-2">{p.published ? "Δημοσιευμένο" : "Πρόχειρο"}</td>
                  <td className="p-2 text-[var(--text-secondary)]">
                    {p.published_at ? new Date(p.published_at).toLocaleString("el-GR") : "—"}
                  </td>
                  <td className="p-2 pr-3">
                    <button
                      type="button"
                      className={lux.btnSecondary + " !px-2 !py-1 text-xs"}
                      onClick={() => void openEdit(p.id)}
                    >
                      Επεξ.
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <div className="max-h-[min(100vh-2rem,900px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-2xl sm:p-5">
            <h3 className="mb-3 text-lg font-semibold text-[var(--text-primary)]">
              {editor.id === "new" ? "Νέα δημοσίευση" : "Επεξεργασία"}
            </h3>
            <div className="space-y-2">
              <label className="block text-xs text-[var(--text-secondary)]">Τίτλος</label>
              <input
                className={lux.select + " w-full !h-auto !py-2 !text-left"}
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              />
              <label className="block text-xs text-[var(--text-secondary)]">Slug (αυτόματο απο τίτλο αν άδειο)</label>
              <input
                className={lux.select + " w-full !h-auto !py-2 font-mono text-sm"}
                value={editor.slug}
                onChange={(e) => setEditor({ ...editor, slug: e.target.value })}
                placeholder="autogen"
              />
              <label className="block text-xs text-[var(--text-secondary)]">Περίληψη</label>
              <input
                className={lux.select + " w-full !h-auto !py-2"}
                value={editor.excerpt ?? ""}
                onChange={(e) => setEditor({ ...editor, excerpt: e.target.value || null })}
              />
              <label className="block text-xs text-[var(--text-secondary)]">Περιεχόμενο (markdown)</label>
              <textarea
                className="min-h-[180px] w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-2 text-sm"
                value={editor.content ?? ""}
                onChange={(e) => setEditor({ ...editor, content: e.target.value })}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs">Κατηγορία</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-2 text-sm"
                    value={editor.category}
                    onChange={(e) => setEditor({ ...editor, category: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs">Εικόνα εξώφ (URL)</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] p-2 text-sm"
                    value={editor.cover_image ?? ""}
                    onChange={(e) => setEditor({ ...editor, cover_image: e.target.value || null })}
                    placeholder="https://…"
                  />
                </div>
              </div>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editor.published}
                  onChange={(e) => setEditor({ ...editor, published: e.target.checked })}
                />
                Δημοσίευση
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
              {editor.id !== "new" && (
                <button
                  type="button"
                  className={lux.btnSecondary}
                  onClick={async () => {
                    if (!editor.id) return;
                    if (!window.confirm("Διαγραφή;")) return;
                    await fetchWithTimeout(`/api/news-posts/${editor.id}`, { method: "DELETE" });
                    setEditor(null);
                    void load();
                  }}
                >
                  Διαγραφή
                </button>
              )}
              <button type="button" className={lux.btnSecondary} onClick={() => setEditor(null)}>
                Άκυρο
              </button>
              <button
                type="button"
                className={lux.btnPrimary}
                disabled={saving}
                onClick={async () => {
                  if (!editor.title?.trim() || !editor.content?.trim()) {
                    setErr("Τίτλος και περιεχόμενο");
                    return;
                  }
                  setErr("");
                  setSaving(true);
                  try {
                    if (editor.id === "new") {
                      const res = await fetchWithTimeout("/api/news-posts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: editor.title,
                          slug: editor.slug || undefined,
                          excerpt: editor.excerpt,
                          content: editor.content,
                          category: editor.category,
                          cover_image: editor.cover_image,
                          published: editor.published,
                        }),
                      });
                      if (!res.ok) {
                        const e = (await res.json().catch(() => ({}))) as { error?: string };
                        setErr(e.error ?? "Σφάλμα");
                        return;
                      }
                    } else {
                      const res = await fetchWithTimeout(`/api/news-posts/${editor.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: editor.title,
                          slug: editor.slug || undefined,
                          excerpt: editor.excerpt,
                          content: editor.content,
                          category: editor.category,
                          cover_image: editor.cover_image,
                          published: editor.published,
                        }),
                      });
                      if (!res.ok) {
                        const e = (await res.json().catch(() => ({}))) as { error?: string };
                        setErr(e.error ?? "Σφάλμα");
                        return;
                      }
                    }
                    setEditor(null);
                    void load();
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? "…" : "Αποθήκευση"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
