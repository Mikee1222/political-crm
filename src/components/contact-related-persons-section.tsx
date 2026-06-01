"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { CenteredModal } from "@/components/ui/centered-modal";
import { ContactSearchCombobox } from "@/components/requests/contact-search-combobox";
import { FormSubmitButton } from "@/components/ui/form-submit-button";

type RelatedContact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  contact_code: string | null;
};

type RelationRow = {
  id: string;
  contact_id_1: string;
  contact_id_2: string;
  relation_type: string | null;
  related: RelatedContact | null;
};

const RELATION_TYPES = [
  { value: "family", label: "Οικογένεια" },
  { value: "colleague", label: "Συνάδελφος" },
  { value: "friend", label: "Φίλος" },
  { value: "other", label: "Άλλο" },
] as const;

function relationLabel(t: string | null | undefined) {
  return RELATION_TYPES.find((x) => x.value === t)?.label ?? t ?? "—";
}

export function ContactRelatedPersonsSection({
  contactId,
  canManage,
}: {
  contactId: string;
  canManage: boolean;
}) {
  const [relations, setRelations] = useState<RelationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [relatedId, setRelatedId] = useState("");
  const [relationType, setRelationType] = useState("family");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/contacts/${contactId}/relations`);
      const j = (await res.json()) as { relations?: RelationRow[]; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        setRelations([]);
        return;
      }
      setErr("");
      setRelations(j.relations ?? []);
    } catch {
      setErr("Σφάλμα φόρτωσης");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (relationId: string) => {
    const res = await fetchWithTimeout(
      `/api/contacts/${contactId}/relations?relation_id=${encodeURIComponent(relationId)}`,
      { method: "DELETE" },
    );
    if (res.ok) {
      setRelations((prev) => prev.filter((r) => r.id !== relationId));
    }
  };

  const add = async () => {
    if (!relatedId) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetchWithTimeout(`/api/contacts/${contactId}/relations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ related_contact_id: relatedId, relation_type: relationType }),
      });
      const j = (await res.json()) as { relation?: RelationRow; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      if (j.relation) {
        setRelations((prev) => [j.relation!, ...prev]);
      } else {
        await load();
      }
      setAddOpen(false);
      setRelatedId("");
      setRelationType("family");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm" data-hq-card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#003476]">Σχετικά πρόσωπα</h2>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1 text-xs font-semibold text-[#003476] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Προσθήκη
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-[var(--text-muted)]">Φόρτωση…</p>
      ) : err ? (
        <p className="text-xs text-red-400">{err}</p>
      ) : relations.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Κανένα σχετικό πρόσωπο.</p>
      ) : (
        <ul className="space-y-0">
          {relations.map((r) => {
            const c = r.related;
            if (!c) return null;
            const name = `${c.first_name} ${c.last_name}`.trim() || "—";
            return (
              <li
                key={r.id}
                className="flex items-center gap-2 border-b border-[var(--border)]/50 py-2 last:border-0"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#003476]/10 text-[10px] font-bold text-[#003476]">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/contacts/${c.id}`} className="text-sm font-medium hover:underline">
                    {name}
                  </Link>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {relationLabel(r.relation_type)}
                    {c.contact_code ? ` · ${c.contact_code}` : ""}
                  </p>
                </div>
                <Link
                  href={`/contacts/${c.id}`}
                  className="text-xs text-[var(--text-muted)] hover:text-[#003476]"
                  aria-label={`Άνοιγμα ${name}`}
                >
                  →
                </Link>
                {canManage && (
                  <button
                    type="button"
                    className="rounded p-1 text-[var(--text-muted)] hover:bg-red-500/10 hover:text-red-400"
                    aria-label="Αφαίρεση"
                    onClick={() => void remove(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <CenteredModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setRelatedId("");
        }}
        title="Σχετικό πρόσωπο"
        ariaLabel="Προσθήκη σχετικού προσώπου"
        className="!max-w-md"
        footer={
          <>
            <button type="button" className={lux.btnSecondary} onClick={() => setAddOpen(false)} disabled={saving}>
              Άκυρο
            </button>
            <FormSubmitButton type="button" variant="gold" loading={saving} disabled={!relatedId} onClick={() => void add()}>
              Προσθήκη
            </FormSubmitButton>
          </>
        }
      >
        <div className="space-y-4">
          <ContactSearchCombobox label="Επαφή" valueId={relatedId} onChange={(id) => setRelatedId(id)} />
          <div>
            <label className={lux.label} htmlFor="rel-type">
              Σχέση
            </label>
            <select
              id="rel-type"
              className={lux.input}
              value={relationType}
              onChange={(e) => setRelationType(e.target.value)}
            >
              {RELATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
        </div>
      </CenteredModal>
    </div>
  );
}
