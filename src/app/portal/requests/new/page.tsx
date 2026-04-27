"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

export default function NewPortalRequestPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [me, setMe] = useState<{
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null>(null);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/portal/login?next=/portal/requests/new");
        return;
      }
      const m = await fetchWithTimeout("/api/portal/me", { credentials: "same-origin" });
      if (!m.ok) {
        router.replace("/portal/login?next=/portal/requests/new");
        return;
      }
      const mj = (await m.json()) as {
        portal: { email: string; first_name: string; last_name: string; phone: string | null };
      };
      setMe(mj.portal);
      const { data: rc } = await supabase
        .from("request_categories")
        .select("name")
        .order("sort_order", { ascending: true });
      setCats((rc ?? []).map((x: { name: string }) => x.name));
    })();
  }, [router]);

  const onSubmit = useCallback(async () => {
    if (!title.trim()) {
      setErr("Χρειάζεται τίτλος");
      return;
    }
    if (!category) {
      setErr("Διαλέξτε κατηγορία");
      return;
    }
    setErr("");
    setSending(true);
    try {
      const res = await fetchWithTimeout("/api/portal/requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description, category }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; request?: { id: string } };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      if (j.request?.id) {
        router.push(`/portal/requests/${j.request.id}`);
      } else {
        router.push("/portal/requests");
      }
    } catch {
      setErr("Δικτυακό σφάλμα");
    } finally {
      setSending(false);
    }
  }, [title, description, category, router]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <p className="mb-2">
        <Link href="/portal/requests" className="text-sm font-medium" style={{ color: ND }}>
          ← Λίστα
        </Link>
      </p>
      <h1 className="text-xl font-bold text-slate-900">Νέο αίτημα</h1>
      {me && (
        <p className="mt-1 text-sm text-slate-600">
          {me.first_name} {me.last_name} · {me.email}
          {me.phone ? ` · ${me.phone}` : ""}
        </p>
      )}
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-6 space-y-4">
        <div>
          <label className="text-xs font-bold text-slate-600" htmlFor="t">
            Τίτλος
          </label>
          <input
            id="t"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600" htmlFor="c">
            Κατηγορία
          </label>
          <select
            id="c"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
          >
            <option value="">—</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-slate-600" htmlFor="d">
            Περιγραφή
          </label>
          <textarea
            id="d"
            className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="w-full rounded-lg py-2.5 text-sm font-bold text-white sm:w-auto sm:px-6"
          style={{ background: ND }}
          onClick={() => void onSubmit()}
          disabled={sending}
        >
          {sending ? "Υποβολή…" : "Υποβολή αιτήματος"}
        </button>
      </div>
    </div>
  );
}
