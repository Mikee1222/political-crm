"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { HqSelect } from "@/components/ui/hq-select";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { ContactSearchCombobox } from "@/components/requests/contact-search-combobox";
import type { RequestCategoryRow } from "@/lib/request-categories";
import { useFormToast } from "@/contexts/form-toast-context";

const PRIORITIES = ["High", "Medium", "Low"] as const;

const STATUSES = ["Νέο", "Σε εξέλιξη", "Ολοκληρώθηκε", "Απορρίφθηκε"] as const;

type Assignee = { id: string; full_name: string | null; role: string };

type Props = { open: boolean; onClose: () => void; onCreated: () => void };

export function NewRequestModal({ open, onClose, onCreated }: Props) {
  const [categories, setCategories] = useState<RequestCategoryRow[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
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
  const [assignedTo, setAssignedTo] = useState(""); // full name text
  const [initialNote, setInitialNote] = useState("");
  const [titleFieldErr, setTitleFieldErr] = useState<string | null>(null);
  const [contactFieldErr, setContactFieldErr] = useState<string | null>(null);
  const { showToast } = useFormToast();

  const loadMeta = useCallback(async () => {
    const [cRes, aRes] = await Promise.all([
      fetchWithTimeout("/api/request-categories"),
      fetchWithTimeout("/api/team/assignees"),
    ]);
    if (cRes.ok) {
      const cj = (await cRes.json()) as { categories?: RequestCategoryRow[] };
      const list = cj.categories ?? [];
      setCategories(list);
      if (list.length) {
        setCategory((cur) => (list.some((x) => x.name === cur) ? cur : list[0]!.name));
      }
    }
    if (aRes.ok) {
      const aj = (await aRes.json()) as { assignees?: Assignee[] };
      setAssignees(aj.assignees ?? []);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setErr("");
    void loadMeta();
  }, [open, loadMeta]);

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
      const body: Record<string, unknown> = {
        contact_id: contactId,
        title: title.trim(),
        description: description.trim() || null,
        category: category,
        status,
        priority,
        assigned_to: assignedTo || null,
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
      className="flex !max-w-[640px] flex-col overflow-hidden p-0"
      ariaLabel="Νέο αίτημα"
    >
      <form className="flex max-h-[inherit] min-h-0 flex-1 flex-col" role="document" onSubmit={(e) => void submit(e)}>
        <div className="shrink-0 border-b border-[var(--border)] p-4 sm:px-6 sm:py-4">
          <h2 id="new-req-title" className={lux.sectionTitle}>
            Νέο αίτημα
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
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
              <HqSelect id="nr-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.length === 0
                  ? ["Άλλο", "Υγεία", "Εκπαίδευση", "Δημόσια υπηρεσία", "Υποδομές"].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))
                  : categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
              </HqSelect>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lux.label} htmlFor="nr-st">
                  Κατάσταση
                </label>
                <HqSelect id="nr-st" value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </HqSelect>
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
              <HqSelect id="nr-asg" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">—</option>
                {assignees.map((a) => {
                  const name = a.full_name?.trim();
                  const label = name || `Χρήστης ${a.id.slice(0, 8)}…`;
                  return (
                    <option key={a.id} value={name || label}>
                      {label}
                      {a.role ? ` (${a.role})` : ""}
                    </option>
                  );
                })}
              </HqSelect>
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
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <button
            type="button"
            className={lux.btnSecondary + " w-full sm:w-auto"}
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={saving}
          >
            Ακύρωση
          </button>
          <FormSubmitButton type="submit" loading={saving} variant="gold" className="w-full sm:w-auto">
            Δημιουργία
          </FormSubmitButton>
        </div>
      </form>
    </CenteredModal>
  );
}
