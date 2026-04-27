"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { slugifyNews } from "@/lib/slugify";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { useFormToast } from "@/contexts/form-toast-context";
import { requiredText } from "@/lib/form-validation";

const ReactMarkdown = dynamic(() => import("react-markdown"), { ssr: false });

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

const NEWS_CATEGORIES = ["Ανακοίνωση", "Νέα", "Δελτίο τύπου", "Εκδηλώσεις", "Άλλο"] as const;

export function PortalNewsSection() {
  const [list, setList] = useState<Post[] | null>(null);
  const [editor, setEditor] = useState<Post | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const [slugAutogen, setSlugAutogen] = useState(true);
  const formCardRef = useRef<HTMLDivElement>(null);
  const { showToast } = useFormToast();

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/news-posts");
    if (!res.ok) return;
    const j = (await res.json()) as { posts: Post[] };
    setList(j.posts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const editorId = editor?.id;
  useEffect(() => {
    if (!editorId) return;
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editorId]);

  const openNew = () => {
    setErr("");
    setFieldErrors({});
    setPreview(false);
    setSlugAutogen(true);
    setEditor({ ...empty, id: "new" });
  };

  const openEdit = async (id: string) => {
    setErr("");
    setFieldErrors({});
    setPreview(false);
    setSlugAutogen(false);
    const res = await fetchWithTimeout(`/api/news-posts/${id}`);
    if (!res.ok) {
      setErr("Σφάλμα");
      return;
    }
    const j = (await res.json()) as { post: Post & { content: string } };
    setEditor({ ...j.post, content: j.post.content });
  };

  const onTitleChange = (title: string) => {
    if (!editor) return;
    const next = { ...editor, title };
    if (slugAutogen) {
      const s = slugifyNews(title);
      if (s) next.slug = s;
    }
    setEditor(next);
  };

  const onSlugChange = (slug: string) => {
    setSlugAutogen(false);
    if (!editor) return;
    setEditor({ ...editor, slug });
  };

  const validateCoverUrl = (u: string): string | null => {
    if (!u.trim()) return null;
    try {
      // eslint-disable-next-line no-new -- check URL
      new URL(u);
      return null;
    } catch {
      return "Μη έγκυρο URL";
    }
  };

  const validateForm = (): boolean => {
    if (!editor) return false;
    const e: Record<string, string> = {};
    const t = requiredText(editor.title, "τίτλος");
    if (t) e.title = t;
    const c = requiredText(editor.content ?? "", "περιεχόμενο");
    if (c) e.content = c;
    const u = validateCoverUrl(editor.cover_image ?? "");
    if (u) e.cover_image = u;
    setFieldErrors(e);
    return Object.keys(e).length === 0;
  };

  const closeEditor = () => {
    setEditor(null);
    setFieldErrors({});
  };

  return (
    <section className={lux.card}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className={lux.pageTitle + " mb-1"}>Νέα & ανακοινώσεις (portal)</h2>
          <p className="text-sm text-[var(--text-secondary)]">Δημοσίευση στο /portal (δημόσια άρθρα)</p>
        </div>
        <button
          type="button"
          className={lux.btnPrimary}
          onClick={openNew}
          disabled={!!editor}
        >
          Νέα δημοσίευση
        </button>
      </div>
      {err && !editor && (
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
                      disabled={!!editor}
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
          ref={formCardRef}
          className="data-hq-card mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-5 sm:p-8"
        >
          <div className="mb-6 flex flex-col gap-3 border-b border-[var(--border)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">
              {editor.id === "new" ? "Νέα δημοσίευση" : "Επεξεργασία άρθρου"}
            </h3>
            <div className="flex flex-wrap gap-2">
              {editor.id !== "new" && (
                <button
                  type="button"
                  className={lux.btnDanger + " !py-2 text-sm"}
                  onClick={async () => {
                    if (!editor.id) return;
                    if (!window.confirm("Διαγραφή;")) return;
                    await fetchWithTimeout(`/api/news-posts/${editor.id}`, { method: "DELETE" });
                    closeEditor();
                    void load();
                  }}
                >
                  Διαγραφή
                </button>
              )}
              <button type="button" className={lux.btnSecondary + " !py-2 text-sm"} onClick={closeEditor}>
                Άκυρο
              </button>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-gold)]">Βασικά στοιχεία</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <HqLabel htmlFor="pn-title" required>
                    Τίτλος
                  </HqLabel>
                  <input
                    id="pn-title"
                    className={[lux.input, fieldErrors.title ? lux.inputError : ""].join(" ")}
                    value={editor.title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    onBlur={() => {
                      const t = requiredText(editor.title, "τίτλος");
                      setFieldErrors((fe) => {
                        const next = { ...fe };
                        if (t) next.title = t;
                        else delete next.title;
                        return next;
                      });
                    }}
                    placeholder="Τίτλος άρθρου"
                    aria-invalid={!!fieldErrors.title}
                    aria-describedby={fieldErrors.title ? "pn-err-title" : undefined}
                  />
                  <HqFieldError id="pn-err-title">{fieldErrors.title}</HqFieldError>
                </div>
                <div>
                  <HqLabel htmlFor="pn-slug">Slug (URL)</HqLabel>
                  <p className="mb-1.5 text-[10px] text-[var(--text-muted)]">Από τίτλο αν δεν αλλάξετε· μόνο λατινικά-τύπου</p>
                  <input
                    id="pn-slug"
                    className={[lux.input, "font-mono text-sm", fieldErrors.slug ? lux.inputError : ""].join(" ")}
                    value={editor.slug}
                    onChange={(e) => onSlugChange(e.target.value)}
                  />
                </div>
                <div>
                  <HqLabel htmlFor="pn-cat">Κατηγορία</HqLabel>
                  <HqSelect id="pn-cat" value={editor.category} onChange={(e) => setEditor({ ...editor, category: e.target.value })}>
                    {NEWS_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </HqSelect>
                </div>
                <div className="sm:col-span-2">
                  <HqLabel htmlFor="pn-ex">Περίληψη</HqLabel>
                  <input
                    id="pn-ex"
                    className={lux.input}
                    value={editor.excerpt ?? ""}
                    onChange={(e) => setEditor({ ...editor, excerpt: e.target.value || null })}
                    placeholder="Μικρή περιγραφή για τη λίστα νέων"
                  />
                </div>
                <div className="sm:col-span-2">
                  <HqLabel htmlFor="pn-cover">Εξώφυλλο (URL)</HqLabel>
                  <input
                    id="pn-cover"
                    className={[lux.input, fieldErrors.cover_image ? lux.inputError : ""].join(" ")}
                    value={editor.cover_image ?? ""}
                    onChange={(e) => setEditor({ ...editor, cover_image: e.target.value || null })}
                    placeholder="https://…"
                  />
                  <HqFieldError>{fieldErrors.cover_image}</HqFieldError>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-gold)]">Περιεχόμενο (Markdown)</p>
              <HqLabel required>Κύριο κείμενο</HqLabel>
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  className={!preview ? lux.btnPrimary + " !py-1.5 text-xs" : lux.btnSecondary + " !py-1.5 text-xs"}
                  onClick={() => setPreview(false)}
                >
                  Επεξεργασία
                </button>
                <button
                  type="button"
                  className={preview ? lux.btnPrimary + " !py-1.5 text-xs" : lux.btnSecondary + " !py-1.5 text-xs"}
                  onClick={() => setPreview(true)}
                >
                  Προεπισκόπηση
                </button>
              </div>
              {preview ? (
                <div
                  className="min-h-[220px] rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-body)] [&_a]:text-[var(--accent-gold)] [&_h1]:mb-2 [&_h2]:mb-2 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5"
                >
                  <ReactMarkdown>{editor.content ?? ""}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  className={[lux.textarea, "min-h-[280px] font-mono", fieldErrors.content ? lux.inputError : ""].join(" ")}
                  value={editor.content ?? ""}
                  onChange={(e) => setEditor({ ...editor, content: e.target.value })}
                  placeholder="Γράψτε το κείμενο σε Markdown…"
                />
              )}
              <HqFieldError>{fieldErrors.content}</HqFieldError>
            </div>

            <div className="border-t border-[var(--border)] pt-4">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent-gold)]">Δημοσίευση</p>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-[var(--text-primary)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-[var(--border)]"
                  checked={editor.published}
                  onChange={(e) => setEditor({ ...editor, published: e.target.checked })}
                />
                Δημοσιευμένο (εμφανίζεται στο /portal)
              </label>
            </div>
          </div>

          {err && (
            <p className="mt-4 text-sm text-amber-200" role="status">
              {err}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2 border-t border-[var(--border)] pt-4 sm:flex-row sm:justify-end">
            <FormSubmitButton
              type="button"
              variant="gold"
              loading={saving}
              className="w-full sm:ml-auto sm:min-w-[200px]"
              onClick={async () => {
                if (!editor) return;
                if (!validateForm()) {
                  showToast("Ελέγξτε τα πεδία της φόρμας.", "error");
                  return;
                }
                setErr("");
                setSaving(true);
                try {
                  const body = {
                    title: editor.title.trim(),
                    slug: editor.slug?.trim() || undefined,
                    excerpt: editor.excerpt,
                    content: (editor.content ?? "").trim(),
                    category: editor.category,
                    cover_image: editor.cover_image,
                    published: editor.published,
                  };
                  if (editor.id === "new") {
                    const res = await fetchWithTimeout("/api/news-posts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    if (!res.ok) {
                      const er = (await res.json().catch(() => ({}))) as { error?: string };
                      const msg = er.error ?? "Σφάλμα";
                      setErr(msg);
                      showToast(msg, "error");
                      return;
                    }
                    showToast("Η δημοσίευση δημιουργήθηκε.", "success");
                  } else {
                    const res = await fetchWithTimeout(`/api/news-posts/${editor.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    if (!res.ok) {
                      const er = (await res.json().catch(() => ({}))) as { error?: string };
                      const msg = er.error ?? "Σφάλμα";
                      setErr(msg);
                      showToast(msg, "error");
                      return;
                    }
                    showToast("Οι αλλαγές αποθηκεύτηκαν.", "success");
                  }
                  closeEditor();
                  void load();
                } catch {
                  const msg = "Σφάλμα δικτύου";
                  setErr(msg);
                  showToast(msg, "error");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Αποθήκευση
            </FormSubmitButton>
          </div>
        </div>
      )}
    </section>
  );
}
