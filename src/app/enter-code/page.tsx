"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Shield } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";

export default function EnterCodePage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const nextPath = () => {
    const next = new URLSearchParams(window.location.search).get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/dashboard";
  };

  const handleSubmit = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchWithTimeout("/api/access-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        router.push(nextPath());
        router.refresh();
      } else {
        setError(data.error ?? "Λάθος κωδικός.");
      }
    } catch {
      setError("Σφάλμα σύνδεσης.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="w-full max-w-sm">
        <div className="space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-gold)]/10">
            <Shield className="h-8 w-8 text-[var(--accent-gold)]" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Κλειδαριθμός Πρόσβασης</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Ζητήστε τον 6-ψήφιο κωδικό από έναν διαχειριστή.
            </p>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && void handleSubmit()}
            placeholder="000000"
            aria-label="Κλειδαριθμός 6 ψηφίων"
            className="w-full rounded-xl border-2 border-[var(--border)] bg-[var(--bg-primary)] px-4 py-4 text-center font-mono text-3xl tracking-widest text-[var(--text-primary)] transition-colors focus:border-[var(--accent-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]/30"
          />
          {error ? <p className="text-sm font-medium text-red-500">{error}</p> : null}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={code.length !== 6 || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-gold)] py-3 text-sm font-semibold text-[var(--text-badge-on-gold)] transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Είσοδος
          </button>
          <p className="text-xs text-[var(--text-muted)]">
            Ο κωδικός αλλάζει κάθε ώρα. Η πρόσβαση ισχύει για 2 ώρες.
          </p>
        </div>
      </div>
    </div>
  );
}
