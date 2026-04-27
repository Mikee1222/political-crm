"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Building2, ChevronLeft } from "lucide-react";
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
      ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200"
      : s === "Σε εξέλιξη"
        ? "bg-amber-100 text-amber-900 ring-1 ring-amber-200"
        : s === "Απορρίφθηκε"
          ? "bg-rose-100 text-rose-800 ring-1 ring-rose-200"
          : "bg-slate-100 text-slate-800 ring-1 ring-slate-200";
  return <span className={`inline-flex rounded-full px-4 py-1.5 text-sm font-extrabold ${c}`}>{s || "Νέο"}</span>;
}

function fmt(d: string | null | undefined) {
  if (!d) {
    return "—";
  }
  return new Date(d).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const STEPS = ["Υποβλήθηκε", "Σε εξέλιξη", "Ολοκληρώθηκε"] as const;

export default function PortalRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";
  const [r, setR] = useState<Req | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!id) {
      return;
    }
    setErr("");
    const res = await fetchWithTimeout(`/api/portal/requests/${id}`, { credentials: "same-origin" });
    if (res.status === 401) {
      router.replace("/portal/login?next=" + encodeURIComponent("/portal/requests/" + id));
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
        <Link href="/portal/requests" className="mt-4 inline-block font-bold" style={{ color: ND }}>
          Επιστροφή στα αιτήματα
        </Link>
      </div>
    );
  }
  if (!r) {
    return <p className="p-6 text-[#64748B]">Φόρτωση…</p>;
  }

  const st = r.status || "Νέο";
  const isRejected = st === "Απορρίφθηκε";
  const done = st === "Ολοκληρώθηκε";

  let stepIndex = 0;
  if (st === "Σε εξέλιξη" || (st === "Νέο" && !done)) {
    stepIndex = 1;
  }
  if (done) {
    stepIndex = 2;
  }
  if (isRejected) {
    stepIndex = 1;
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/portal/requests"
        className="inline-flex items-center gap-1 text-sm font-extrabold hover:underline"
        style={{ color: ND }}
      >
        <ChevronLeft className="h-4 w-4" />
        Επιστροφή στα αιτήματά μου
      </Link>

      <div
        className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm sm:p-8"
        style={{ borderTop: "4px solid #C9A84C" }}
      >
        {r.request_code && (
          <p className="font-mono text-sm font-extrabold" style={{ color: ND }}>
            {r.request_code}
          </p>
        )}
        <h1 className="mt-2 text-2xl font-extrabold text-[#1A1A2E] sm:text-3xl">{r.title}</h1>
        <div className="mt-3">{bigBadge(st)}</div>
        {r.category && <p className="mt-3 text-sm text-[#64748B]">{r.category}</p>}
        <p className="mt-1 text-xs text-[#94A3B8]">Υποβλήθηκε: {fmt(r.created_at)}</p>
      </div>

      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Κατάσταση</h2>
        <div className="mt-4">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all"
              style={{
                width: `${((stepIndex + 1) / 3) * 100}%`,
                background: "linear-gradient(90deg, #C9A84C, #003476)",
                maxWidth: isRejected ? "50%" : "100%",
              }}
            />
          </div>
          <div className="mt-4 flex justify-between gap-1 text-center text-xs font-bold sm:text-sm">
            {STEPS.map((label, i) => (
              <div
                key={label}
                className="flex-1"
                style={{
                  color: i <= stepIndex && !(isRejected && i === 2) ? ND : "#94A3B8",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        {isRejected && (
          <p className="mt-2 text-sm font-semibold text-rose-700">Το αίτημα τέθηκε σε κατάσταση «Απορρίφθηκε».</p>
        )}
      </section>

      {r.portal_message && (
        <div
          className="rounded-2xl border-2 p-5 shadow-sm"
          style={{ borderColor: "#00347633", background: "linear-gradient(180deg, #e8f0f9 0%, #fff 100%)" }}
        >
          <p className="flex items-center gap-2 text-sm font-extrabold text-[#003476]">
            <Building2 className="h-5 w-5" />
            Ενημέρωση από το γραφείο
          </p>
          <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed text-[#1A1A2E]">{r.portal_message}</p>
        </div>
      )}

      <section className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Λεπτομέρειες</h2>
        {r.category && (
          <p className="mt-3 text-sm text-[#1A1A2E]">
            <span className="text-[#64748B]">Κατηγορία: </span> {r.category}
          </p>
        )}
        <p className="mt-4 text-sm font-bold text-[#64748B]">Περιγραφή</p>
        <p className="mt-1 whitespace-pre-wrap text-base leading-[1.7] text-[#1A1A2E]">
          {r.description?.trim() || "—"}
        </p>
      </section>
    </div>
  );
}
