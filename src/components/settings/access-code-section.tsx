"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type AccessCodePayload = {
  code?: string;
  valid_until?: string;
  minutes_left?: number;
  error?: string;
};

function formatAthensChangeTime(iso: string): string {
  return new Intl.DateTimeFormat("el-GR", {
    timeZone: "Europe/Athens",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function AccessCodeSecuritySection() {
  const [accessCode, setAccessCode] = useState<{ code: string; validUntil: string } | null>(null);
  const [countdown, setCountdown] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithTimeout("/api/access-code");
      const data = (await res.json()) as AccessCodePayload;
      if (!res.ok) {
        setLoadErr(data.error ?? "Σφάλμα φόρτωσης");
        setAccessCode(null);
        return;
      }
      if (data.code && data.valid_until) {
        setAccessCode({ code: data.code, validUntil: data.valid_until });
        setLoadErr(null);
      }
    } catch {
      setLoadErr("Σφάλμα δικτύου");
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = setInterval(() => void load(), 60_000);
    return () => clearInterval(refresh);
  }, [load]);

  useEffect(() => {
    if (!accessCode?.validUntil) {
      setCountdown("");
      return;
    }
    const untilMs = new Date(accessCode.validUntil).getTime();
    const tick = () => {
      const left = untilMs - Date.now();
      if (left <= 0) {
        setCountdown("00:00");
        void load();
        return;
      }
      setCountdown(formatCountdown(left));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [accessCode?.validUntil, load]);

  return (
    <section className={lux.card}>
      <h2 className={lux.pageTitle + " mb-1"}>ΑΣΦΑΛΕΙΑ ΠΡΟΣΒΑΣΗΣ</h2>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Κλειδαριθμός πρόσβασης CRM για μη-διαχειριστές (αλλάζει κάθε 8 ώρες: 00:00, 08:00, 16:00 ώρα
        Αθήνας).
      </p>
      {loadErr ? <p className="text-sm text-amber-200">{loadErr}</p> : null}
      {accessCode ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--accent-gold)]">
            Κλειδαριθμός τρέχοντος διαστήματος
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-mono text-4xl font-bold tracking-widest text-[var(--text-primary)]">
              {accessCode.code}
            </span>
            <div className="text-xs text-[var(--text-muted)]">
              <p>Επόμενη αλλαγή ({formatAthensChangeTime(accessCode.validUntil)} ώρα Αθήνας):</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-[var(--accent-gold)]">{countdown || "—"}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Δώστε αυτόν τον κωδικό στους χρήστες που θέλουν να συνδεθούν μετά την αποσύνδεση ή λήξη πρόσβασης.
          </p>
        </div>
      ) : !loadErr ? (
        <p className="text-sm text-[var(--text-muted)]">Φόρτωση κωδικού…</p>
      ) : null}
    </section>
  );
}
