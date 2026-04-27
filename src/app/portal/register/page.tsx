"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invite = (searchParams.get("invite") ?? "").trim();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-[-webkit-fill-available] min-h-dvh flex flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/portal" className="text-sm font-semibold" style={{ color: ND }}>
          ← Αρχική
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-center text-xl font-bold" style={{ color: ND }}>
            Δημιουργία λογαριασμού
          </h1>
          {err && <p className="mt-3 text-center text-sm text-red-600" role="alert">{err}</p>}
          <form
            className="mt-6 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr("");
              if (password.length < 6) {
                setErr("Ελάχιστα 6 χαρακτήρες");
                return;
              }
              if (password !== password2) {
                setErr("Οι κωδικοί δεν ταιριάζουν");
                return;
              }
              setLoading(true);
              try {
                const res = await fetchWithTimeout("/api/portal/auth/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: email.trim(),
                    password,
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    phone: phone.trim(),
                    invite: invite || undefined,
                  }),
                });
                const j = (await res.json()) as { error?: string };
                if (!res.ok) {
                  setErr(j.error ?? "Σφάλμα");
                  return;
                }
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
                if (error) {
                  setErr("Η εγγραφή πέτυχε, αλλά απέτυχε η αυτόματη σύνδεση. Δοκιμάστε /portal/login. " + error.message);
                  return;
                }
                router.push("/portal/dashboard");
                router.refresh();
              } catch {
                setErr("Σφάλμα δικτύου");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div>
              <label className="text-xs font-semibold text-slate-600">Μικρό όνομα</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Επίθετο</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Email</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Τηλέφωνο</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Κωδικός</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">Επιβεβαίωση κωδικού</label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <button
              type="submit"
              className="mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white"
              style={{ background: ND }}
              disabled={loading}
            >
              {loading ? "…" : "Εγγραφή"}
            </button>
          </form>
          <p className="mt-3 text-center text-sm text-slate-600">
            <Link href="/portal/login" className="font-bold" style={{ color: ND }}>
              Έχετε λογαριασμό; Είσοδος
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PortalRegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-slate-50 p-6 text-sm text-slate-600">Φόρτωση…</div>}>
      <RegisterForm />
    </Suspense>
  );
}
