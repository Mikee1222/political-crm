"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type AccessCodePayload = {
  code?: string;
  minutes_left?: number;
  error?: string;
};

export function AccessCodeSecuritySection() {
  const [accessCode, setAccessCode] = useState<{ code: string; minutes_left: number } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchWithTimeout("/api/access-code");
        const data = (await res.json()) as AccessCodePayload;
        if (!res.ok) {
          setLoadErr(data.error ?? "Σφάλμα φόρτωσης");
          setAccessCode(null);
          return;
        }
        if (data.code) {
          setAccessCode({
            code: data.code,
            minutes_left: typeof data.minutes_left === "number" ? data.minutes_left : 0,
          });
          setLoadErr(null);
        }
      } catch {
        setLoadErr("Σφάλμα δικτύου");
      }
    };

    void load();
    const interval = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>ΑΣΦΑΛΕΙΑ</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Κλειδαριθμός πρόσβασης CRM για μη-διαχειριστές (αλλάζει κάθε ώρα UTC).
      </p>
      {loadErr ? <p className="text-sm text-amber-200">{loadErr}</p> : null}
      {accessCode ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--accent-gold)]">
            Κλειδαριθμός Τρέχουσας Ώρας
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-mono text-4xl font-bold tracking-widest text-[var(--text-primary)]">
              {accessCode.code}
            </span>
            <div className="text-xs text-[var(--text-muted)]">
              <p>Ισχύει για:</p>
              <p className="font-semibold text-[var(--text-primary)]">{accessCode.minutes_left} λεπτά</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Δώστε αυτόν τον κωδικό στους χρήστες που θέλουν να συνδεθούν.
          </p>
        </div>
      ) : !loadErr ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση κωδικού…</p>
      ) : null}
    </section>
  );
}
