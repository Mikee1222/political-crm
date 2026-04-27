"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

type Req = {
  id: string;
  request_code: string | null;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  portal_message: string | null;
};

function bigBadge(s: string) {
  const c =
    s === "Ολοκληρώθηκε"
      ? "bg-emerald-100 text-emerald-900"
      : s === "Σε εξέλιξη"
        ? "bg-amber-100 text-amber-900"
        : s === "Απορρίφθηκε"
          ? "bg-rose-100 text-rose-900"
          : "bg-slate-200 text-slate-800";
  return <span className={`inline-flex rounded-full px-3 py-1 text-sm font-bold ${c}`}>{s || "Νέο"}</span>;
}

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PortalRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";
  const [r, setR] = useState<Req | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setErr("");
    const res = await fetchWithTimeout(`/api/portal/requests/${id}`, { credentials: "same-origin" });
    if (res.status === 401) {
      router.replace("/portal/login");
      return;
    }
    if (!res.ok) {
      setErr("Δεν βρέθηκε");
      return;
    }
    const j = (await res.json()) as { request: Req };
    setR(j.request);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (err && !r) {
    return (
      <div className="p-6">
        <p className="text-red-600">{err}</p>
        <Link href="/portal/requests" className="mt-2 inline-block" style={{ color: ND }}>
          Λίστα
        </Link>
      </div>
    );
  }
  if (!r) {
    return <p className="p-6 text-slate-500">Φόρτωση…</p>;
  }

  const st = r.status || "Νέο";
  const done = st === "Ολοκληρώθηκε" || st === "Απορρίφθηκε";
  const inProg = st === "Σε εξέλιξη" || done;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <p>
        <Link href="/portal/requests" className="text-sm font-medium" style={{ color: ND }}>
          ← Όλα τα αιτήματα
        </Link>
      </p>
      <div className="space-y-2">
        {r.request_code && (
          <p className="font-mono text-sm font-bold text-slate-500">{r.request_code}</p>
        )}
        <h1 className="text-2xl font-bold text-slate-900">{r.title}</h1>
        {r.category && <p className="text-sm text-slate-600">{r.category}</p>}
        <div className="pt-1">{bigBadge(st)}</div>
        <p className="text-xs text-slate-500">Υποβλήθηκε: {fmt(r.created_at)}</p>
      </div>

      <section>
        <h2 className="text-sm font-bold text-slate-800">Κατάσταση</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
          {(
            [
              { label: "Νέο", on: true, t: r.created_at },
              { label: "Σε εξέλιξη", on: inProg, t: inProg ? (r.status === "Νέο" ? null : r.updated_at) : null },
              {
                label: "Ολοκληρώθηκε",
                on: st === "Ολοκληρώθηκε",
                t: st === "Ολοκληρώθηκε" ? r.updated_at : null,
              },
            ] as const
          ).map((step, i) => (
            <div
              key={step.label}
              className="flex min-w-0 flex-1 flex-col border-l-4 border-slate-200 pl-3 sm:border-l-0 sm:border-t-4 sm:pl-0 sm:pt-2"
              style={
                step.on
                  ? { borderColor: ND }
                  : undefined
              }
            >
              <span className="text-xs font-bold" style={step.on ? { color: ND } : { color: "#94a3b8" }}>
                {step.label}
              </span>
              <span className="text-[10px] text-slate-500">
                {step.t ? fmt(step.t) : st === "Απορρίφθηκε" && i === 2 ? "—" : ""}
              </span>
            </div>
          ))}
        </div>
        {st === "Απορρίφθηκε" && (
          <p className="mt-2 text-sm text-rose-700">Το αίτημα εμφανίζεται ως απορριφθέν.</p>
        )}
      </section>

      {r.portal_message && (
        <div
          className="rounded-2xl border-2 p-4"
          style={{ borderColor: "#C9A84C", background: "#fffdf7" }}
        >
          <p className="text-xs font-bold text-slate-800">Ενημέρωση από το γραφείο</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.portal_message}</p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-bold text-slate-800">Περιγραφή</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
          {r.description?.trim() || "Χωρίς κείμενο."}
        </p>
      </section>
    </div>
  );
}
