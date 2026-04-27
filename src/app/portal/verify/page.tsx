"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

function VerifyBody() {
  const sp = useSearchParams();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = (sp.get("token") ?? "").trim();
    if (!t) {
      setErr("Λείπει token");
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await fetchWithTimeout("/api/portal/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (cancelled) {
        return;
      }
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setDone(true);
      window.setTimeout(() => router.replace("/portal/dashboard"), 400);
    })();
    return () => {
      cancelled = true;
    };
  }, [sp, router]);

  return (
    <div className="flex min-h-[-webkit-fill-available] min-h-dvh flex-col items-center justify-center bg-[#FAFBFC] px-4 text-center">
      {err && (
        <p className="text-sm text-red-600" role="alert">
          {err}{" "}
          <Link href="/portal/login" className="font-bold underline" style={{ color: ND }}>
            Σύνδεση
          </Link>
        </p>
      )}
      {done && !err && <p className="text-slate-700">Το email επαληθεύτηκε. Μεταφορά…</p>}
      {!err && !done && <p className="text-slate-600">Επαλήθευση…</p>}
    </div>
  );
}

export default function PortalVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-sm text-slate-600">Φόρτωση…</div>
      }
    >
      <VerifyBody />
    </Suspense>
  );
}
