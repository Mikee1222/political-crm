"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Check, X, Tag, ChevronDown, ChevronUp } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import type { ContactGroupRow } from "@/lib/contact-groups";

const DEFAULT_CATEGORY = "Άλλο";

type GroupItem = Pick<ContactGroupRow, "id" | "name" | "color" | "category">;

function groupCategory(g: GroupItem): string {
  const c = g.category?.trim();
  return c || DEFAULT_CATEGORY;
}

export function GroupCategoriesSettings() {
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [deleteCat, setDeleteCat] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [gRes, cRes] = await Promise.all([
        fetchWithTimeout("/api/groups"),
        fetchWithTimeout("/api/groups/categories"),
      ]);
      const gData = (await gRes.json().catch(() => ({}))) as { groups?: GroupItem[]; error?: string };
      const cData = (await cRes.json().catch(() => ({}))) as { categories?: string[]; error?: string };
      if (!gRes.ok) {
        setErr(gData.error ?? "Φόρτωση ομάδων απέτυχε");
        return;
      }
      if (!cRes.ok) {
        setErr(cData.error ?? "Φόρτωση κατηγοριών απέτυχε");
        return;
      }
      setGroups(gData.groups ?? []);
      const cats = cData.categories ?? [];
      setCategories(cats.includes(DEFAULT_CATEGORY) ? cats : [...cats, DEFAULT_CATEGORY].sort((a, b) => a.localeCompare(b, "el")));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groupedGroups = useMemo(() => {
    const acc: Record<string, GroupItem[]> = {};
    for (const cat of categories) {
      acc[cat] = groups.filter((g) => groupCategory(g) === cat);
    }
    return acc;
  }, [categories, groups]);

  const postCategory = async (body: Record<string, unknown>) => {
    const res = await fetchWithTimeout("/api/groups/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(j.error ?? "Σφάλμα");
    }
  };

  const handleRename = async (oldName: string) => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingCategory(null);
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await postCategory({ action: "rename", oldName, newName: trimmed });
      setCategories((prev) => prev.map((c) => (c === oldName ? trimmed : c)).sort((a, b) => a.localeCompare(b, "el")));
      setGroups((prev) => prev.map((g) => (groupCategory(g) === oldName ? { ...g, category: trimmed } : g)));
      setEditingCategory(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (catName: string) => {
    setErr(null);
    setBusy(true);
    try {
      await postCategory({ action: "delete", oldName: catName });
      setCategories((prev) => prev.filter((c) => c !== catName));
      setGroups((prev) =>
        prev.map((g) => (groupCategory(g) === catName ? { ...g, category: DEFAULT_CATEGORY } : g)),
      );
      setDeleteCat(null);
      if (expandedCategory === catName) setExpandedCategory(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    const trimmed = newCategory.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    setErr(null);
    setBusy(true);
    try {
      await postCategory({ action: "create" });
      setCategories((prev) => [...prev, trimmed].sort((a, b) => a.localeCompare(b, "el")));
      setNewCategory("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα");
    } finally {
      setBusy(false);
    }
  };

  const handleMoveGroup = async (groupId: string, newCat: string) => {
    setErr(null);
    setBusy(true);
    try {
      await postCategory({ action: "assign", groupIds: [groupId], category: newCat });
      setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, category: newCat } : g)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Σφάλμα");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className={lux.sectionTitle + " mb-1"}>Κατηγορίες Ομάδων</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Οργανώστε τις ομάδες επαφών σε κατηγορίες για εύκολη πλοήγηση στα φίλτρα.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
            placeholder="Νέα κατηγορία…"
            disabled={busy}
            className={lux.input + " !h-9 w-full sm:w-44"}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!newCategory.trim() || busy}
            className={lux.btnPrimary + " inline-flex w-full items-center justify-center gap-1.5 !py-2 sm:w-auto"}
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden />
            Προσθήκη
          </button>
        </div>
      </div>

      {err && (
        <p className="text-sm text-amber-200" role="status">
          {err}
        </p>
      )}

      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat} className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:gap-3">
              <Tag className="h-4 w-4 shrink-0 text-[var(--accent-gold)]" aria-hidden />

              {editingCategory === cat ? (
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleRename(cat);
                      if (e.key === "Escape") setEditingCategory(null);
                    }}
                    disabled={busy}
                    className={lux.input + " !h-9 min-w-[120px] flex-1"}
                  />
                  <button
                    type="button"
                    onClick={() => void handleRename(cat)}
                    disabled={busy}
                    className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10"
                    aria-label="Αποθήκευση"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    disabled={busy}
                    className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-card)]"
                    aria-label="Άκυρο"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--text-primary)]">{cat}</span>
                  <span className="rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                    {groupedGroups[cat]?.length ?? 0} ομάδες
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(cat);
                        setEditName(cat);
                      }}
                      disabled={busy}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                      aria-label={`Επεξεργασία ${cat}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {cat !== DEFAULT_CATEGORY && (
                      <button
                        type="button"
                        onClick={() => setDeleteCat(cat)}
                        disabled={busy}
                        className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-red-500/10 hover:text-red-300"
                        aria-label={`Διαγραφή ${cat}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setExpandedCategory(expandedCategory === cat ? null : cat)}
                      className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-card)]"
                      aria-expanded={expandedCategory === cat}
                      aria-label={expandedCategory === cat ? "Σύμπτυξη" : "Ανάπτυξη"}
                    >
                      {expandedCategory === cat ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {expandedCategory === cat && (
              <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {(groupedGroups[cat] ?? []).length === 0 ? (
                  <p className="px-4 py-3 text-xs text-[var(--text-muted)]">Καμία ομάδα σε αυτή την κατηγορία.</p>
                ) : (
                  (groupedGroups[cat] ?? []).map((g) => (
                    <div
                      key={g.id}
                      className="flex flex-wrap items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--bg-card)] sm:gap-3"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--border)]"
                        style={{ background: g.color || "#003476" }}
                      />
                      <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">{g.name}</span>
                      <select
                        value={groupCategory(g)}
                        onChange={(e) => void handleMoveGroup(g.id, e.target.value)}
                        disabled={busy}
                        className={lux.input + " !h-8 !w-auto max-w-[180px] text-xs"}
                        aria-label={`Κατηγορία για ${g.name}`}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {deleteCat && (
        <CenteredModal
          open
          onClose={() => setDeleteCat(null)}
          title="Διαγραφή κατηγορίας"
          ariaLabel="Διαγραφή κατηγορίας"
          className="!max-w-sm"
          footer={
            <>
              <button type="button" onClick={() => setDeleteCat(null)} className={lux.btnSecondary} disabled={busy}>
                Άκυρο
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(deleteCat)}
                className={lux.btnDanger}
                disabled={busy}
              >
                {busy ? "…" : "Διαγραφή"}
              </button>
            </>
          }
        >
          <p className="text-sm text-[var(--text-secondary)]">
            Να διαγραφεί η κατηγορία «{deleteCat}»; Οι ομάδες της θα μεταφερθούν στο «{DEFAULT_CATEGORY}».
          </p>
        </CenteredModal>
      )}
    </div>
  );
}
