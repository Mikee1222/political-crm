"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { lux } from "@/lib/luxury-styles";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const action =
      mode === "login"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });
    const { error: authError } = await action;
    if (authError) {
      setError(authError.message);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 hq-particles">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(201, 168, 76, 0.08) 0%, transparent 50%), repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(201,168,76,0.03) 1px, rgba(201,168,76,0.03) 2px)",
        }}
      />
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-[420px] space-y-6 rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-10 shadow-[0_8px_48px_rgba(0,0,0,0.55)] hq-modal-panel"
      >
        <div className="mb-2 flex flex-col items-center text-center">
          <div className="mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-full bg-gradient-to-br from-[#C9A84C] to-[#8B6914] text-lg font-bold text-white shadow-[0_0_32px_rgba(201,168,76,0.35)]">
            ΚΚ
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Καραγκούνης CRM</h1>
          <p className="mt-1.5 text-sm text-[var(--accent-gold)]">Campaign Headquarters</p>
        </div>
        <p className="text-center text-sm text-[var(--text-secondary)]">Σύνδεση με email και κωδικό</p>
        <div>
          <label className={lux.label} htmlFor="em">
            Email
          </label>
          <input
            id="em"
            className={lux.input}
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <label className={lux.label} htmlFor="pw">
            Κωδικός
          </label>
          <input
            id="pw"
            className={lux.input}
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-center text-sm text-[var(--danger)]">{error}</p>}
        <button
          type="submit"
          className={[
            lux.btnGold,
            "w-full !py-3.5 !text-base active:scale-[0.98]",
            "h-12 min-h-[48px] min-w-0",
          ].join(" ")}
        >
          {mode === "login" ? "Σύνδεση" : "Εγγραφή"}
        </button>
        <button
          type="button"
          className={[lux.btnSecondary, "w-full !py-3.5", "border-[var(--border)]"].join(" ")}
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Δημιουργία λογαριασμού" : "Έχω ήδη λογαριασμό"}
        </button>
      </form>
    </main>
  );
}
