"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { isUuid } from "@/lib/resolve-entity-id";
import { CenteredModal } from "@/components/ui/centered-modal";
import { ContactSearchCombobox } from "@/components/requests/contact-search-combobox";
import { FormSubmitButton } from "@/components/ui/form-submit-button";

export type RequestPersonContact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2?: string | null;
  landline?: string | null;
};

type PersonRole = "requester" | "affected" | "helper" | "handler";

async function addRequestPerson(
  requestId: string,
  contactId: string,
  role: PersonRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = contactId.trim();
  if (!isUuid(trimmed)) {
    return { ok: false, error: "Επιλέξτε έγκυρη επαφή από τη λίστα." };
  }
  const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestId)}/persons`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact_id: trimmed, role }),
  });
  const j = (await res.json()) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: j.error ?? "Σφάλμα" };
  }
  return { ok: true };
}

const SECTIONS: { role: PersonRole; title: string }[] = [
  { role: "requester", title: "Πρόσωπα που αιτούνται" },
  { role: "affected", title: "Πρόσωπα που αφορά" },
  { role: "helper", title: "Πρόσωπα που βοηθούν" },
];

function initials(c: RequestPersonContact) {
  const a = `${c.first_name?.[0] ?? ""}${c.last_name?.[0] ?? ""}`.trim();
  return a.toUpperCase() || "?";
}

function PersonList({
  contacts,
  canManage,
  onRemove,
}: {
  contacts: RequestPersonContact[];
  canManage: boolean;
  onRemove: (contactId: string) => void;
}) {
  if (contacts.length === 0) {
    return <p className="text-xs text-[var(--text-muted)]">—</p>;
  }
  return (
    <ul className="space-y-0">
      {contacts.map((c) => {
        const name = `${c.first_name} ${c.last_name}`.trim() || "—";
        return (
          <li
            key={c.id}
            className="flex items-center gap-2 border-b border-[var(--border)]/50 py-1.5 last:border-0"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[10px] font-bold text-[var(--accent)]">
              {initials(c)}
            </div>
            <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{name}</span>
            <Link href={`/contacts/${c.id}`} className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)]">
              →
            </Link>
            {canManage && (
              <button
                type="button"
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-red-400"
                aria-label={`Αφαίρεση ${name}`}
                onClick={() => onRemove(c.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PersonSection({
  title,
  role,
  contacts,
  canManage,
  requestId,
  onChanged,
}: {
  title: string;
  role: PersonRole;
  contacts: RequestPersonContact[];
  canManage: boolean;
  requestId: string;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const add = async () => {
    if (!contactId) return;
    setSaving(true);
    setErr("");
    try {
      const result = await addRequestPerson(requestId, contactId, role);
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      setAddOpen(false);
      setContactId("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetchWithTimeout(
      `/api/requests/${encodeURIComponent(requestId)}/persons?contact_id=${encodeURIComponent(id)}&role=${role}`,
      { method: "DELETE" },
    );
    if (res.ok) onChanged();
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className={lux.sectionLabel}>{title}</h3>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={"flex items-center gap-1 " + lux.linkAction}
          >
            <Plus className="h-3 w-3" aria-hidden />
            Προσθήκη
          </button>
        )}
      </div>
      <PersonList contacts={contacts} canManage={canManage} onRemove={(id) => void remove(id)} />
      <CenteredModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setContactId("");
        }}
        title={title}
        ariaLabel={`Προσθήκη — ${title}`}
        className="!max-w-md"
        footer={
          <>
            <button type="button" className={lux.btnSecondary} onClick={() => setAddOpen(false)} disabled={saving}>
              Άκυρο
            </button>
            <FormSubmitButton type="button" variant="gold" loading={saving} disabled={!contactId} onClick={() => void add()}>
              Προσθήκη
            </FormSubmitButton>
          </>
        }
      >
        <ContactSearchCombobox label="Επαφή" valueId={contactId} onChange={(id) => setContactId(id)} />
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </CenteredModal>
    </div>
  );
}

export function RequestPersonsSections({
  requestId,
  requesters,
  affected,
  helpers,
  handlers,
  canManage,
  onChanged,
}: {
  requestId: string;
  requesters: RequestPersonContact[];
  affected: RequestPersonContact[];
  helpers: RequestPersonContact[];
  handlers: RequestPersonContact[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const lists: Record<PersonRole, RequestPersonContact[]> = {
    requester: requesters,
    affected,
    helper: helpers,
    handler: handlers,
  };

  return (
    <div className="space-y-3">
      {SECTIONS.map((s) => (
        <PersonSection
          key={s.role}
          title={s.title}
          role={s.role}
          contacts={lists[s.role]}
          canManage={canManage}
          requestId={requestId}
          onChanged={onChanged}
        />
      ))}
      <HandlersSection
        requestId={requestId}
        handlers={handlers}
        canManage={canManage}
        onChanged={onChanged}
      />
    </div>
  );
}

function HandlersSection({
  requestId,
  handlers,
  canManage,
  onChanged,
}: {
  requestId: string;
  handlers: RequestPersonContact[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const add = async () => {
    if (!contactId) return;
    setSaving(true);
    setErr("");
    try {
      const result = await addRequestPerson(requestId, contactId, "handler");
      if (!result.ok) {
        setErr(result.error);
        return;
      }
      setAddOpen(false);
      setContactId("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    const res = await fetchWithTimeout(
      `/api/requests/${encodeURIComponent(requestId)}/persons?contact_id=${encodeURIComponent(id)}&role=handler`,
      { method: "DELETE" },
    );
    if (res.ok) onChanged();
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Χειριστές αιτήματος
        </h3>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className={"flex items-center gap-1 " + lux.linkAction}
          >
            <Plus className="h-3 w-3" aria-hidden />
            Προσθήκη
          </button>
        )}
      </div>
      <PersonList contacts={handlers} canManage={canManage} onRemove={(id) => void remove(id)} />
      <CenteredModal
        open={addOpen}
        onClose={() => {
          setAddOpen(false);
          setContactId("");
        }}
        title="Χειριστές αιτήματος"
        ariaLabel="Προσθήκη χειριστή"
        className="!max-w-md"
        footer={
          <>
            <button type="button" className={lux.btnSecondary} onClick={() => setAddOpen(false)} disabled={saving}>
              Άκυρο
            </button>
            <FormSubmitButton type="button" variant="gold" loading={saving} disabled={!contactId} onClick={() => void add()}>
              Προσθήκη
            </FormSubmitButton>
          </>
        }
      >
        <ContactSearchCombobox label="Επαφή χειριστή" valueId={contactId} onChange={(id) => setContactId(id)} />
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </CenteredModal>
    </div>
  );
}
