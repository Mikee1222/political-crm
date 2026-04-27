"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Check, Lock, Mail, Phone, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";

const ND = "#003476";

const STEPS = ["Προσωπικά", "Επαφή", "Κωδικός"] as const;

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invite = (searchParams.get("invite") ?? "").trim();
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [gdpr, setGdpr] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const canNext0 = firstName.trim() && lastName.trim();
  const canNext1 = email.trim() && email.includes("@");
  const canSubmit = password.length >= 6 && password === password2 && gdpr;

  return (
    <div className="flex min-h-[-webkit-fill-available] min-h-dvh flex-col bg-[#FAFBFC]">
      <div className="border-b border-[#E2E8F0] bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link href="/portal" className="text-sm font-bold" style={{ color: ND }}>
            ← Αρχική
          </Link>
          <Link href="/portal/login" className="text-sm font-semibold text-[#64748B] hover:underline">
            Έχετε λογαριασμό;
          </Link>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-[480px] rounded-2xl border border-[#E2E8F0] bg-white p-8 shadow-[0_8px_30px_rgba(0,52,118,0.08)] sm:p-10">
          <div className="flex justify-center">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-extrabold text-[#0f172a]"
              style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
            >
              ΚΚ
            </div>
          </div>
          <h1 className="mt-4 text-center text-2xl font-extrabold" style={{ color: ND }}>
            Δημιουργία λογαριασμού
          </h1>

          <div className="mt-6 flex items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                  style={
                    i <= step
                      ? { background: ND, color: "white" }
                      : { background: "#E2E8F0", color: "#64748B" }
                  }
                >
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="mx-1 h-0.5 w-6 sm:w-8" style={{ background: i < step ? ND : "#E2E8F0" }} />
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-center text-xs font-bold uppercase tracking-wide text-[#64748B]">
            {STEPS[step]}
          </p>

          {err && (
            <p className="mt-4 text-center text-sm text-red-600" role="alert">
              {err}
            </p>
          )}

          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (step < 2) {
                return;
              }
              setErr("");
              if (!canSubmit) {
                setErr("Συμφωνήστε με την πολιτική και ελέγξτε τον κωδικό");
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
                  setErr("Η εγγραφή πέτυχε, αλλά απέτυχε η αυτόματη σύνδεση. " + error.message);
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
            {step === 0 && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Όνομα</label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-10 pr-3 text-sm"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Επίθετο</label>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-10 pr-3 text-sm"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                      required
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full rounded-xl py-3.5 text-sm font-extrabold text-white"
                  style={{ background: ND }}
                  onClick={() => (canNext0 ? setStep(1) : setErr("Συμπληρώστε όνομα & επίθετο"))}
                >
                  Επόμενο
                </button>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Email</label>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-10 pr-3 text-sm"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Τηλέφωνο</label>
                  <div className="relative mt-1.5">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-10 pr-3 text-sm"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-[#E2E8F0] py-3 text-sm font-bold text-[#64748B]"
                    onClick={() => setStep(0)}
                  >
                    Πίσω
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-xl py-3 text-sm font-extrabold text-white"
                    style={{ background: ND }}
                    onClick={() => (canNext1 ? setStep(2) : setErr("Έγκυρο email απαιτείται"))}
                  >
                    Επόμενο
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Κωδικός</label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-10 pr-3 text-sm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Επιβεβαίωση</label>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className="w-full rounded-xl border border-[#E2E8F0] py-3 pl-10 pr-3 text-sm"
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      type="password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm text-[#64748B]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-[#E2E8F0] text-[#003476] focus:ring-[#003476]"
                    checked={gdpr}
                    onChange={(e) => setGdpr(e.target.checked)}
                    required
                  />
                  <span>
                    Έχω ενημερωθεί για την{" "}
                    <span className="font-semibold text-[#1A1A2E]">επεξεργασία προσωπικών δεδομένων</span> (GDPR) και
                    αποδέχομαι τη χρήση τους αποκλειστικά για επικοινωνία σχετικά με το αίτημά μου.
                  </span>
                </label>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    className="flex-1 rounded-xl border border-[#E2E8F0] py-3.5 text-sm font-bold text-[#64748B]"
                    onClick={() => setStep(1)}
                  >
                    Πίσω
                  </button>
                  <button
                    type="submit"
                    className="flex-1 rounded-xl py-3.5 text-sm font-extrabold text-white"
                    style={{ background: ND }}
                    disabled={loading}
                  >
                    {loading ? "…" : "Εγγραφή"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

export default function PortalRegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-[#FAFBFC] p-6 text-sm text-[#64748B]">Φόρτωση…</div>}>
      <RegisterForm />
    </Suspense>
  );
}
