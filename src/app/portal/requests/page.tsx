"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Inbox, Plus } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

type Row = {
  id: string;
  request_code: string | null;
  title: string;
  category: string | null;
  status: string | null;
  created_at: string | null;
};

const TABS: { id: string; label: string }[] = [
  { id: "all", label: "Όλα" },
  { id: "Νέο", label: "Νέο" },
  { id: "Σε εξέλιξη", label: "Σε εξέλιξη" },
  { id: "Ολοκληρώθηκε", label: "Ολοκληρώθηκε" },
  { id: "Απορρίφθηκε", label: "Απορρίφθηκε" },
];

function leftBorder(s: string | null) {
  const x = s || "Νέο";
  if (x === "Ολοκληρώθηκε") {
    return "#059669";
  }
  if (x === "Απορρίφθηκε") {
    return "#E11D48";
  }
  if (x === "Σε εξέλιξη") {
    return "#1e5fa8";
  }
  return "#C9A84C";
}

function statusBadge(s: string) {
  const c =
    s === "Ολοκληρώθηκε"
      ? "bg-emerald-100 text-emerald-900"
      : s === "Σε εξέλιξη"
        ? "bg-amber-100 text-amber-900"
        : s === "Απορρίφθηκε"
          ? "bg-rose-100 text-rose-800"
          : "bg-slate-100 text-slate-800";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${c}`}>{s || "Νέο"}</span>;
}

export default function PortalRequestsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const res = await fetchWithTimeout("/api/portal/requests", { credentials: "same-origin" });
    if (res.status === 401) {
      router.replace("/portal/login?next=/portal/requests");
      return;
    }
    if (!res.ok) {
      setErr("Σφάλμα");
      return;
    }
    const j = (await res.json()) as { requests: Row[] };
    setRows(j.requests ?? []);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const r = rows ?? [];
    if (filter === "all") {
      return r;
    }
    return r.filter((x) => (x.status || "Νέο") === filter);
  }, [rows, filter]);

  const openCount = useMemo(
    () => (rows ?? []).filter((r) => r.status === "Νέο" || r.status === "Σε εξέλιξη").length,
    [rows],
  );

  if (err) {
    return <p className="p-6 text-sm text-red-600">{err}</p>;
  }
  if (rows === null) {
    return <p className="p-6 text-sm text-[#64748B]">Φόρτωση…</p>;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="mb-2">
        <Link href="/portal/dashboard" className="text-sm font-bold hover:underline" style={{ color: ND }}>
          ← Πίσω στον πίνακα
        </Link>
      </p>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl" style={{ color: ND }}>
            Τα αιτήματά μου
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            <Inbox className="mr-1 inline h-4 w-4" />
            {rows.length} συνολικά · {openCount} σε εξέλιξη
          </p>
        </div>
        <Link
          href="/portal/requests/new"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-extrabold text-[#0f172a] shadow-sm transition hover:brightness-105 sm:w-auto"
          style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
        >
          <Plus className="h-4 w-4" />
          Νέο Αίτημα
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            className={[
              "rounded-full px-3.5 py-1.5 text-sm font-bold transition",
              filter === t.id ? "text-white shadow" : "bg-white text-[#64748B] ring-1 ring-[#E2E8F0] hover:bg-slate-50",
            ].join(" ")}
            style={filter === t.id ? { background: ND } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((r) => (
          <Link
            key={r.id}
            href={`/portal/requests/${r.id}`}
            className="group block rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            style={{ borderLeftWidth: 3, borderLeftColor: leftBorder(r.status) }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {r.request_code && (
                  <span
                    className="mb-1 inline-block rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold text-[#0f172a]"
                    style={{ background: "linear-gradient(135deg, #C9A84C50, #8B691430)" }}
                  >
                    {r.request_code}
                  </span>
                )}
                <h2 className="line-clamp-2 text-lg font-bold text-[#1A1A2E]">{r.title}</h2>
                {r.category && (
                  <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-[#64748B]">
                    {r.category}
                  </span>
                )}
                <p className="mt-2 text-xs text-[#64748B]">
                  {r.created_at ? new Date(r.created_at).toLocaleString("el-GR") : "—"}
                </p>
                <div className="mt-2">{statusBadge(r.status || "Νέο")}</div>
              </div>
              <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-[#94A3B8] transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="mt-8 text-center text-sm text-[#64748B]">Καμία καταχώριση με αυτά τα φίλτρα.</p>
      )}
    </div>
  );
}
