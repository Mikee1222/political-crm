"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type Opt = { id: string; text: string };

export function PublicPollContent() {
  const params = useParams();
  const sp = useSearchParams();
  const id = String(params.id ?? "");
  const contactId = sp.get("contact");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<Opt[]>([]);
  const [choice, setChoice] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(sp.get("voted") === "1");

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    const res = await fetchWithTimeout(`/api/public/polls/${id}`);
    const j = (await res.json().catch(() => ({}))) as { error?: string; poll?: { title: string; question: string; options: unknown } };
    if (!res.ok) {
      setErr(j.error ?? "Σφάλμα");
      setLoading(false);
      return;
    }
    const p = j.poll!;
    setTitle(p.title);
    setQuestion(p.question);
    setOptions((p.options as Opt[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactId || !choice) {
      setErr("Χρειάζεται σύνδεσμος επαφής (contact) και επιλογή.");
      return;
    }
    setSaving(true);
    setErr(null);
    const res = await fetchWithTimeout(`/api/public/polls/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, option_id: choice }),
    });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Σφάλμα");
      setSaving(false);
      return;
    }
    setDone(true);
    setSaving(false);
  };

  if (loading) {
    return (
      <div className={`min-h-dvh ${lux.pageBg} flex items-center justify-center p-4`}>
        <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className={`min-h-dvh ${lux.pageBg} flex flex-col items-center justify-center p-6`}>
        <div className={lux.card + " max-w-md text-center"}>
          <h1 className={lux.pageTitle}>Ευχαριστούμε</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Η απάντησή σας καταχωρήθηκε.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh ${lux.pageBg} p-4 py-10`}>
      <div className="mx-auto max-w-lg">
        <div className={lux.card}>
          {err && <p className="mb-3 text-sm text-red-200">{err}</p>}
          <h1 className="text-lg font-bold text-[var(--text-primary)]">{title}</h1>
          <p className="mt-2 text-sm text-[var(--text-primary)]">{question}</p>
          {!contactId ? (
            <p className="mt-4 text-sm text-amber-200">Χρειάζεται έγκυρος σύνδεσμος από το γραφείο (παράμετρος contact).</p>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3">
              {options.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] p-3 hover:bg-[var(--bg-elevated)]/50"
                >
                  <input
                    type="radio"
                    name="opt"
                    value={o.id}
                    checked={choice === o.id}
                    onChange={() => setChoice(o.id)}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-[var(--text-primary)]">{o.text}</span>
                </label>
              ))}
              <button
                type="submit"
                disabled={saving || !choice}
                className={lux.btnPrimary + " w-full !py-2.5"}
              >
                {saving ? "Υποβολή…" : "Υποβολή"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
