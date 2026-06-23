"use client";

import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { isUuid } from "@/lib/resolve-entity-id";
import { ContactSearchCombobox } from "@/components/requests/contact-search-combobox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useResolveAuthorName } from "@/contexts/staff-aliases-context";

export type RequestPersonContact = {
  id: string;
  person_id?: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2?: string | null;
  landline?: string | null;
};

type PersonRole = "requester" | "affected" | "helper";

type StaffUser = { id: string; full_name: string | null; email: string };

function parseHandlerName(content: string): string | null {
  const match = content.match(/\[Χειριστής: (.+?)\]/);
  return match ? match[1].trim() : null;
}

function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

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

async function removeRequestPerson(
  requestId: string,
  contact: RequestPersonContact,
  role: PersonRole,
): Promise<boolean> {
  const personId = contact.person_id?.trim();
  if (personId && isUuid(personId)) {
    const res = await fetchWithTimeout(
      `/api/requests/${encodeURIComponent(requestId)}/persons/${encodeURIComponent(personId)}`,
      { method: "DELETE" },
    );
    return res.ok;
  }

  const contactId = contact.id.trim();
  if (!isUuid(contactId)) return false;
  const res = await fetchWithTimeout(
    `/api/requests/${encodeURIComponent(requestId)}/persons?contact_id=${encodeURIComponent(contactId)}&role=${role}`,
    { method: "DELETE" },
  );
  return res.ok;
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

function initialsFromName(name: string) {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (w.length === 0) return "?";
  if (w.length === 1) return w[0]!.slice(0, 2).toUpperCase() || "?";
  return `${w[0]![0] ?? ""}${w[1]![0] ?? ""}`.toUpperCase() || "?";
}

function PersonList({
  contacts,
  canManage,
  onRemove,
  hideWhenEmpty,
}: {
  contacts: RequestPersonContact[];
  canManage: boolean;
  onRemove: (contact: RequestPersonContact) => void;
  hideWhenEmpty?: boolean;
}) {
  if (contacts.length === 0) {
    return hideWhenEmpty ? null : <p className="text-xs text-[var(--text-muted)]">—</p>;
  }
  return (
    <ul className="space-y-0">
      {contacts.map((c) => {
        const name = `${c.first_name} ${c.last_name}`.trim() || "—";
        const rowKey = c.person_id ?? `${c.id}-${name}`;
        return (
          <li
            key={rowKey}
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
                onClick={() => onRemove(c)}
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

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setContactId("");
    setErr("");
  }, []);

  const add = useCallback(
    async (pickedId?: string) => {
      const id = (pickedId ?? contactId).trim();
      if (!id) return;
      setSaving(true);
      setErr("");
      try {
        const result = await addRequestPerson(requestId, id, role);
        if (!result.ok) {
          setErr(result.error);
          return;
        }
        closeAdd();
        onChanged();
      } finally {
        setSaving(false);
      }
    },
    [closeAdd, contactId, onChanged, requestId, role],
  );

  const remove = useCallback(
    async (contact: RequestPersonContact) => {
      const ok = await removeRequestPerson(requestId, contact, role);
      if (ok) onChanged();
    },
    [onChanged, requestId, role],
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className={lux.sectionLabel}>{title}</h3>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              if (addOpen) {
                closeAdd();
                return;
              }
              setErr("");
              setContactId("");
              setAddOpen(true);
            }}
            className={"flex items-center gap-1 " + lux.linkAction}
            aria-expanded={addOpen}
          >
            <Plus className="h-3 w-3" aria-hidden />
            {addOpen ? "Άκυρο" : "Προσθήκη"}
          </button>
        )}
      </div>
      {addOpen && canManage && (
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
          <ContactSearchCombobox
            key={`${role}-add`}
            label="Επαφή"
            valueId={contactId}
            onChange={(id) => setContactId(id)}
            onSelect={(id) => void add(id)}
            disabled={saving}
          />
          {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
          {saving ? <p className="mt-2 text-xs text-[var(--text-muted)]">Αποθήκευση…</p> : null}
        </div>
      )}
      <PersonList contacts={contacts} canManage={canManage} onRemove={(c) => void remove(c)} />
    </div>
  );
}

function RequestHandlersSection({
  requestId,
  handlerNames,
  canManage,
  onChanged,
}: {
  requestId: string;
  handlerNames: string[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const resolveName = useResolveAuthorName();

  const names = useMemo(
    () => dedupeNames(handlerNames.map((name) => resolveName(name))),
    [handlerNames, resolveName],
  );

  useEffect(() => {
    if (!canManage) return;
    void fetchWithTimeout("/api/admin/users")
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as { users?: StaffUser[] };
        setStaffUsers(j.users ?? []);
      })
      .catch(() => setStaffUsers([]));
  }, [canManage]);

  const closeAdd = useCallback(() => {
    setAddOpen(false);
    setSelectedUserId("");
    setErr("");
  }, []);

  const addHandler = useCallback(
    async (userId: string) => {
      const user = staffUsers.find((u) => u.id === userId);
      const fullName = user?.full_name?.trim() || user?.email?.trim();
      if (!fullName) {
        setErr("Επιλέξτε στέλεχος CRM.");
        return;
      }
      setSaving(true);
      setErr("");
      try {
        const res = await fetchWithTimeout(`/api/requests/${encodeURIComponent(requestId)}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `[Χειριστής: ${fullName}]` }),
        });
        const j = (await res.json()) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? "Σφάλμα");
          return;
        }
        closeAdd();
        onChanged();
      } finally {
        setSaving(false);
      }
    },
    [closeAdd, onChanged, requestId, staffUsers],
  );

  const staffOptions = useMemo(
    () =>
      staffUsers.map((u) => ({
        value: u.id,
        label: u.full_name?.trim() || u.email || u.id,
      })),
    [staffUsers],
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Χειριστές αιτήματος
        </h3>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              if (addOpen) {
                closeAdd();
                return;
              }
              setErr("");
              setSelectedUserId("");
              setAddOpen(true);
            }}
            className={"flex items-center gap-1 " + lux.linkAction}
            aria-expanded={addOpen}
          >
            <Plus className="h-3 w-3" aria-hidden />
            {addOpen ? "Άκυρο" : "Προσθήκη"}
          </button>
        )}
      </div>
      {addOpen && canManage && (
        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-3">
          <label className={lux.label}>Στέλεχος CRM</label>
          <SearchableSelect
            value={selectedUserId}
            onChange={(id) => {
              setSelectedUserId(id);
              if (id) void addHandler(id);
            }}
            options={staffOptions}
            placeholder="Αναζήτηση στελέχους…"
            searchPlaceholder="Αναζήτηση…"
            aria-label="Στέλεχος CRM"
            disabled={saving}
          />
          {err ? <p className="mt-2 text-sm text-red-400">{err}</p> : null}
          {saving ? <p className="mt-2 text-xs text-[var(--text-muted)]">Αποθήκευση…</p> : null}
        </div>
      )}
      {names.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">—</p>
      ) : (
        <ul className="space-y-0">
          {names.map((name) => (
            <li
              key={name}
              className="flex items-center gap-2 border-b border-[var(--border)]/50 py-1.5 last:border-0"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[10px] font-bold text-[var(--accent)]">
                {initialsFromName(name)}
              </div>
              <span className="flex-1 text-sm font-medium text-[var(--text-primary)]">{name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RequestPersonsSections({
  requestId,
  requesters,
  affected,
  helpers,
  handlerNames,
  canManage,
  onChanged,
}: {
  requestId: string;
  requesters: RequestPersonContact[];
  affected: RequestPersonContact[];
  helpers: RequestPersonContact[];
  handlerNames: string[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const lists: Record<PersonRole, RequestPersonContact[]> = {
    requester: requesters,
    affected,
    helper: helpers,
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
      <RequestHandlersSection
        requestId={requestId}
        handlerNames={handlerNames}
        canManage={canManage}
        onChanged={onChanged}
      />
    </div>
  );
}

export { parseHandlerName, dedupeNames };
