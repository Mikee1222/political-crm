"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Phone } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { HqLabel } from "@/components/ui/hq-form-primitives";

type RetellSettings = {
  configured: boolean;
  retell_api_key: string;
  retell_agent_id: string;
  retell_from_number: string;
  retell_transfer_number: string;
  retell_webhook_token: string;
};

type FieldKey =
  | "retell_api_key"
  | "retell_agent_id"
  | "retell_from_number"
  | "retell_transfer_number"
  | "retell_webhook_token";

const FIELDS: {
  key: FieldKey;
  label: string;
  placeholder: string;
  type?: "password" | "tel" | "text";
  sensitive?: boolean;
  hint?: string;
}[] = [
  {
    key: "retell_api_key",
    label: "API Key",
    placeholder: "sk-ret-...",
    type: "password",
    sensitive: true,
  },
  {
    key: "retell_agent_id",
    label: "Agent ID",
    placeholder: "agent_...",
    type: "text",
  },
  {
    key: "retell_from_number",
    label: "Αριθμός Αποστολής",
    placeholder: "+30...",
    type: "tel",
  },
  {
    key: "retell_transfer_number",
    label: "Αριθμός Transfer",
    placeholder: "+30...",
    type: "tel",
    // Used only by custom LLM WS/HTTP; Single Prompt Agent sets transfer in Retell dashboard.
    hint: "Για Single Prompt Agent, ο αριθμός transfer ρυθμίζεται απευθείας στο Retell dashboard.",
  },
  {
    key: "retell_webhook_token",
    label: "Webhook URL Token",
    placeholder: "••••••••",
    type: "password",
    sensitive: true,
    hint: "Shared token στο URL (όχι HMAC — το Retell δεν παρέχει signing secret). Generate: openssl rand -hex 16. Webhook URL: https://crm.kkaragkounis.com/api/retell/webhook?token=<token>",
  },
];

export function RetellSettingsSection() {
  const [data, setData] = useState<RetellSettings | null>(null);
  const [values, setValues] = useState<Record<FieldKey, string>>({
    retell_api_key: "",
    retell_agent_id: "",
    retell_from_number: "",
    retell_transfer_number: "",
    retell_webhook_token: "",
  });
  const [editing, setEditing] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [dirty, setDirty] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/admin/settings/retell");
      const j = (await res.json().catch(() => ({}))) as RetellSettings & { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Δεν φορτώθηκαν οι ρυθμίσεις Retell");
        return;
      }
      setData(j);
      setValues({
        retell_api_key: j.retell_api_key ?? "",
        retell_agent_id: j.retell_agent_id ?? "",
        retell_from_number: j.retell_from_number ?? "",
        retell_transfer_number: j.retell_transfer_number ?? "",
        retell_webhook_token: j.retell_webhook_token ?? "",
      });
      setEditing({});
      setDirty({});
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (key: FieldKey, sensitive?: boolean) => {
    setEditing((e) => ({ ...e, [key]: true }));
    if (sensitive) {
      setValues((v) => ({ ...v, [key]: "" }));
    }
    setDirty((d) => ({ ...d, [key]: true }));
    setMsg(null);
  };

  const onChange = (key: FieldKey, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty((d) => ({ ...d, [key]: true }));
    setMsg(null);
  };

  const save = async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const body: Partial<Record<FieldKey, string>> = {};
      for (const f of FIELDS) {
        if (!dirty[f.key]) continue;
        const val = values[f.key].trim();
        if (!val || val.includes("****")) continue;
        body[f.key] = val;
      }
      if (Object.keys(body).length === 0) {
        setErr("Δεν υπάρχουν αλλαγές προς αποθήκευση.");
        return;
      }
      const res = await fetchWithTimeout("/api/admin/settings/retell", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setErr(j.error ?? "Αποτυχία αποθήκευσης");
        return;
      }
      setMsg("✓ Αποθηκεύτηκε — απαιτείται redeploy για να ισχύσουν οι αλλαγές");
      await load();
    } catch {
      setErr("Σφάλμα δικτύου");
    } finally {
      setSaving(false);
    }
  };

  const configured = Boolean(data?.configured);

  return (
    <section className={lux.card + " w-full min-w-0 max-w-full"}>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <Phone className="h-5 w-5 text-[var(--accent-gold)]" aria-hidden />
        <h2 className={lux.sectionTitle + " mb-0"}>Retell AI</h2>
        {!loading && (
          <span
            className={
              configured
                ? "inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-500/40"
                : "inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-300 ring-1 ring-red-500/40"
            }
          >
            {configured ? "Συνδεδεμένο" : "Μη ρυθμισμένο"}
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Κλειδιά και αριθμοί Retell (αποθήκευση στο Vercel env — ισχύουν μετά το επόμενο deploy).
      </p>

      {loading && <p className="text-sm text-[var(--text-muted)]">Φόρτωση…</p>}

      {!loading && (
        <div className="space-y-4">
          {FIELDS.map((f) => {
            const isEdit = Boolean(editing[f.key]);
            return (
              <div key={f.key}>
                <HqLabel htmlFor={`retell-${f.key}`}>{f.label}</HqLabel>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id={`retell-${f.key}`}
                    className={lux.input + " font-mono text-sm"}
                    type={f.type === "password" && !isEdit ? "text" : f.type ?? "text"}
                    value={values[f.key]}
                    placeholder={f.placeholder}
                    disabled={!isEdit}
                    autoComplete="off"
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                  <button
                    type="button"
                    className={lux.btnIcon}
                    aria-label={`Επεξεργασία ${f.label}`}
                    title="Επεξεργασία"
                    onClick={() => startEdit(f.key, f.sensitive)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                {f.hint ? (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{f.hint}</p>
                ) : null}
              </div>
            );
          })}

          {err && (
            <p className="text-sm text-amber-200" role="status">
              {err}
            </p>
          )}
          {msg && (
            <p className="text-sm text-emerald-300" role="status">
              {msg}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              className={lux.btnPrimary + " !py-2.5"}
              disabled={saving || Object.keys(dirty).length === 0}
              onClick={() => void save()}
            >
              {saving ? "Αποθήκευση…" : "Αποθήκευση"}
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              Οι αλλαγές εφαρμόζονται μετά το επόμενο Vercel deploy.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
