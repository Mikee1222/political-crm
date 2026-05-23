"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { ContactSearchCombobox } from "@/components/requests/contact-search-combobox";
import type { RequestCategoryRow } from "@/lib/request-categories";
import { useFormToast } from "@/contexts/form-toast-context";

const PRIORITIES = ["High", "Medium", "Low"] as const;

const STATUSES = ["Νέο", "Σε εξέλιξη", "Ολοκληρώθηκε", "Απορρίφθηκε"] as const;

type StaffUser = { id: string; full_name: string | null; email: string; role: string };

type Props = { open: boolean; onClose: () => void; onCreated: () => void };

export function NewRequestModal({ open, onClose, onCreated }: Props) {
  const [categories, setCategories] = useState<RequestCategoryRow[]>([]);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [contactId, setContactId] = useState("");
  const [affectedId, setAffectedId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Άλλο");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Νέο");
  const [priority, setPriority] = useState<string>("Medium");
  const [slaDate, setSlaDate] = useState(""); // yyyy-mm-dd optional
  const [assignedTo, setAssignedTo] = useState(""); // profile id
  const [initialNote, setInitialNote] = useState("");
  const [titleFieldErr, setTitleFieldErr] = useState<string | null>(null);
  const [contactFieldErr, setContactFieldErr] = useState<string | null>(null);
  const { showToast } = useFormToast();

  const loadMeta = useCallback(async () => {
    const cRes = await fetchWithTimeout("/api/request-categories");
    if (cRes.ok) {
      const cj = (await cRes.json()) as { categories?: RequestCategoryRow[] };
      const list = cj.categories ?? [];
      setCategories(list);
      if (list.length) {
        setCategory((cur) => (list.some((x) => x.name === cur) ? cur : list[0]!.name));
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr("");
    void loadMeta();
  }, [open, loadMeta]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((d: { users?: StaffUser[] }) => setStaffUsers(d.users ?? []))
      .catch(() => setStaffUsers([]));
  }, [open]);

  const reset = () => {
    setContactId("");
    setAffectedId("");
    setTitle("");
    setDescription("");
    setCategory("Άλλο");
    setStatus("Νέο");
    setPriority("Medium");
    setSlaDate("");
    setAssignedTo("");
    setInitialNote("");
    setErr("");
    setTitleFieldErr(null);
    setContactFieldErr(null);
  };

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setErr("");
    setTitleFieldErr(null);
    setContactFieldErr(null);
    let invalid = false;
    if (!contactId) {
      setContactFieldErr("Επιλέξτε «Πρόσωπο που το ζήτησε».");
      invalid = true;
    }
    if (!title.trim()) {
      setTitleFieldErr("Υποχρεωτικός τίτλος");
      invalid = true;
    }
    if (invalid) {
      showToast("Συμπληρώστε τα υποχρεωτικά πεδία.", "error");
      return;
    }
    setSaving(true);
    try {
      const assignee = staffUsers.find((u) => u.id === assignedTo);
      const assignedName = assignee
        ? (assignee.full_name?.trim() || assignee.email || null)
        : null;
      const body: Record<string, unknown> = {
        contact_id: contactId,
        title: title.trim(),
        description: description.trim() || null,
        category: category,
        status,
        priority,
        assigned_to: assignedName,
        initial_note: initialNote.trim() || undefined,
      };
      if (affectedId) body.affected_contact_id = affectedId;
      if (slaDate) body.sla_due_date = slaDate;
      const res = await fetchWithTimeout("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        const msg = String((j as { error?: string }).error ?? "Σφάλμα");
        setErr(msg);
        showToast(msg, "error");
        return;
      }
      showToast("Το αίτημα δημιουργήθηκε επιτυχώς.", "success");
      reset();
      onClose();
      await onCreated();
    } catch {
      const msg = "Σφάλμα δικτύου";
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <CenteredModal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Νέο αίτημα"
      sheetOnMobile
      className="!max-w-[640px]"
      ariaLabel="Νέο αίτημα"
      footer={
        <>
          <button
            type="button"
            className={lux.btnSecondary + " w-full sm:w-auto"}
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={saving}
          >
            Άκυρο
          </button>
          <FormSubmitButton type="submit" form="new-request-form" loading={saving} variant="gold" className="w-full sm:w-auto">
            Αποθήκευση
          </FormSubmitButton>
        </>
      }
    >
      <form id="new-request-form" role="document" onSubmit={(e) => void submit(e)}>
          {err && (
            <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
              {err}
            </p>
          )}

          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-gold)]">
            1 · Στοιχεία αιτήματος
          </div>
          <div className="grid max-w-[640px] gap-4">
            <div>
              <label className={lux.label} htmlFor="nr-title">
                Τίτλος
                <span className="ml-0.5 text-red-500" aria-hidden>
                  *
                </span>
              </label>
              <input
                id="nr-title"
                className={[lux.input, titleFieldErr ? lux.inputError : ""].filter(Boolean).join(" ")}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleFieldErr) setTitleFieldErr(null);
                }}
                onBlur={() => {
                  if (!title.trim()) setTitleFieldErr("Υποχρεωτικός τίτλος");
                }}
                placeholder="Σύντομος τίτλος"
                required
                aria-invalid={titleFieldErr ? true : undefined}
              />
              {titleFieldErr ? (
                <p className={lux.fieldError} role="alert">
                  {titleFieldErr}
                </p>
              ) : null}
            </div>
            <div>
              <label className={lux.label} htmlFor="nr-cat">
                Κατηγορία
              </label>
              <SearchableSelect
                id="nr-cat"
                value={category}
                onChange={setCategory}
                placeholder="Επιλέξτε κατηγορία"
                options={
                  categories.length === 0
                    ? ["Άλλο", "Υγεία", "Εκπαίδευση", "Δημόσια υπηρεσία", "Υποδομές"].map((n) => ({
                        value: n,
                        label: n,
                      }))
                    : categories.map((c) => ({ value: c.name, label: c.name }))
                }
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lux.label} htmlFor="nr-st">
                  Κατάσταση
                </label>
                <SearchableSelect
                  id="nr-st"
                  value={status}
                  onChange={(v) => setStatus(v as (typeof STATUSES)[number])}
                  placeholder="Κατάσταση"
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                />
              </div>
              <div>
                <label className={lux.label} htmlFor="nr-pri">
                  Priority
                </label>
                <HqSelect id="nr-pri" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </HqSelect>
              </div>
            </div>
            <div>
              <label className={lux.label} htmlFor="nr-desc">
                Περιγραφή
              </label>
              <textarea
                id="nr-desc"
                className={lux.textarea}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Λεπτομέρειες…"
                rows={4}
              />
            </div>
            <div>
              <label className={lux.label} htmlFor="nr-sla">
                SLA (ημερομηνία)
              </label>
              <input
                id="nr-sla"
                type="date"
                className={[lux.input, lux.dateInput].join(" ")}
                value={slaDate}
                onChange={(e) => setSlaDate(e.target.value)}
                placeholder="εεεε-μμ-ηη"
              />
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">Αν μείνει κενό, υπολογίζεται αυτόματα από την κατηγορία.</p>
            </div>
          </div>

          <div className="my-6 h-px bg-[var(--border)]" />

          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-gold)]">
            2 · Επαφές αιτήματος
          </div>
          <div className="grid max-w-[640px] gap-4">
            <ContactSearchCombobox
              required
              label="Πρόσωπο που το ζήτησε"
              valueId={contactId}
              error={contactFieldErr}
              onBlurValidate={() => {
                if (!contactId) setContactFieldErr("Επιλέξτε επαφή.");
              }}
              onChange={(id) => {
                setContactId(id);
                if (id) setContactFieldErr(null);
              }}
            />
            <ContactSearchCombobox
              label="Πρόσωπο που αφορά (προαιρετικό)"
              valueId={affectedId}
              onChange={(id) => setAffectedId(id)}
            />
            <div>
              <label className={lux.label} htmlFor="nr-asg">
                Ανατέθηκε σε
              </label>
              <SearchableSelect
                id="nr-asg"
                value={assignedTo}
                onChange={setAssignedTo}
                placeholder="—"
                options={staffUsers.map((u) => ({
                  value: u.id,
                  label: `${u.full_name || u.email} (${u.role})`,
                }))}
              />
            </div>
          </div>

          <div className="my-6 h-px bg-[var(--border)]" />

          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent-gold)]">
            3 · Σημειώσεις
          </div>
          <div>
            <label className={lux.label} htmlFor="nr-note">
              Αρχική σημείωση (προαιρετική)
            </label>
            <textarea
              id="nr-note"
              className={lux.textarea}
              value={initialNote}
              onChange={(e) => setInitialNote(e.target.value)}
              placeholder="Προσθέτει πρώτη καταχώρηση στο χρονολόγιο…"
              rows={3}
            />
          </div>
      </form>
    </CenteredModal>
  );
}
