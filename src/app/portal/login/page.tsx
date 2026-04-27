"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

function PortalLoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const next = sp.get("next") || "/portal/dashboard";

  return (
    <div className="min-h-[-webkit-fill-available] min-h-dvh flex flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Link href="/portal" className="text-sm font-semibold" style={{ color: ND }}>
          ← Αρχική
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-center text-xl font-bold" style={{ color: ND }}>
            Σύνδεση πολιτών
          </h1>
          <p className="mt-1 text-center text-sm text-slate-500">Κωδικός πρόσβασης πύλης (όχι προσωπικού)</p>
          {err && <p className="mt-3 text-center text-sm text-red-600" role="alert">{err}</p>}
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr("");
              setLoading(true);
              try {
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) {
                  setErr(error.message);
                  return;
                }
                const res = await fetchWithTimeout("/api/portal/me", { credentials: "same-origin" });
                if (!res.ok) {
                  await supabase.auth.signOut();
                  setErr("Λάθος τύπος λογαριασμού. Χρησιμοποιήστε /login για προσωπικό.");
                  return;
                }
                router.push(next.startsWith("/portal") ? next : "/portal/dashboard");
                router.refresh();
              } catch {
                setErr("Σφάλμα δικτύου");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="e">
                Email
              </label>
              <input
                id="e"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600" htmlFor="p">
                Κωδικός
              </label>
              <input
                id="p"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg py-2.5 text-sm font-bold text-white"
              style={{ background: ND }}
              disabled={loading}
            >
              {loading ? "…" : "Είσοδος"}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-600">
            Χωρίς λογαριασμό;{" "}
            <Link href="/portal/register" className="font-bold hover:underline" style={{ color: ND }}>
              Εγγραφή
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <PortalLoginInner />
    </Suspense>
  );
}
