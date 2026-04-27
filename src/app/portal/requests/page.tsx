"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";
const GOLD = "#C9A84C";

type Row = {
  id: string;
  request_code: string | null;
  title: string;
  category: string | null;
  status: string | null;
  created_at: string | null;
};

function badge(s: string) {
  const c =
    s === "Ολοκληρώθηκε"
      ? "bg-emerald-100 text-emerald-900"
      : s === "Σε εξέλιξη"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-200 text-slate-800";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${c}`}>{s}</span>;
}

export default function PortalRequestsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");

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

  if (err) {
    return <p className="p-6 text-sm text-red-600">{err}</p>;
  }
  if (rows === null) {
    return <p className="p-6 text-sm text-slate-500">Φόρτωση…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h1 className="text-xl font-bold" style={{ color: ND }}>Τα αιτήματά μου</h1>
        <Link
          href="/portal/requests/new"
          className="inline-flex w-fit justify-center rounded-lg px-4 py-2 text-sm font-bold"
          style={{ background: GOLD, color: "#0f172a" }}
        >
          + Νέο αίτημα
        </Link>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="p-2 pl-3">Κωδ.</th>
              <th className="p-2">Τίτλος</th>
              <th className="p-2">Κατ.</th>
              <th className="p-2">Κατάσταση</th>
              <th className="p-2 pr-3">Ημ/νία</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-200">
                <td className="p-2 pl-3 font-mono text-xs text-slate-500">{r.request_code}</td>
                <td className="p-2">
                  <Link className="font-medium hover:underline" style={{ color: ND }} href={`/portal/requests/${r.id}`}>
                    {r.title}
                  </Link>
                </td>
                <td className="p-2 text-slate-600">{r.category ?? "—"}</td>
                <td className="p-2">{badge(r.status || "Νέο")}</td>
                <td className="p-2 pr-3 text-slate-600">
                  {r.created_at
                    ? new Date(r.created_at).toLocaleDateString("el-GR")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-4 text-sm text-slate-500">Δεν έχετε αιτήματα ακόμα.</p>}
    </div>
  );
}
