"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { Check, Lock, Mail, Phone, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { mapAuthErrorToGreek, minLength, requiredText, validateEmail, validatePhone10 } from "@/lib/form-validation";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";

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
  const [fe, setFe] = useState<Record<string, string>>({});

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
              setFe({});
              const w1 = minLength(password, 6, "Τουλάχιστον 6 χαρακτήρες");
              if (w1) {
                setFe({ pw1: w1 });
                return;
              }
              if (password !== password2) {
                setFe({ pw2: "Οι κωδικοί δεν ταιριάζουν" });
                return;
              }
              if (!gdpr) {
                setErr("Απαιτείται αποδοχή επεξεργασίας δεδομένων (GDPR).");
                return;
              }
              if (!canSubmit) {
                setErr("Ελέγξτε κωδικό και συμφωνία GDPR.");
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
                  setErr(j.error ?? "Η εγγραφή απέτυχε. Ελέγξτε τα στοιχεία.");
                  return;
                }
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
                if (error) {
                  setErr("Η εγγραφή πέτυχε, αλλά απέτυχε η αυτόματη σύνδεση. " + mapAuthErrorToGreek(error.message));
                  return;
                }
                router.push("/portal/dashboard");
                router.refresh();
              } catch {
                setErr("Σφάλμα δικτύου. Δοκιμάστε ξανά.");
              } finally {
                setLoading(false);
              }
            }}
          >
            {step === 0 && (
              <>
                <div>
                  <HqLabel className="!text-[#64748B]" required>Όνομα</HqLabel>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className={["w-full rounded-xl border py-3 pl-10 pr-3 text-sm", fe.fn ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25"].join(" ")}
                      value={firstName}
                      onChange={(e) => {
                        setFirstName(e.target.value);
                        if (fe.fn) setFe((f) => ({ ...f, fn: "" }));
                      }}
                      autoComplete="given-name"
                    />
                  </div>
                  <HqFieldError>{fe.fn}</HqFieldError>
                </div>
                <div>
                  <HqLabel className="!text-[#64748B]" required>Επίθετο</HqLabel>
                  <div className="relative mt-1.5">
                    <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className={["w-full rounded-xl border py-3 pl-10 pr-3 text-sm", fe.ln ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25"].join(" ")}
                      value={lastName}
                      onChange={(e) => {
                        setLastName(e.target.value);
                        if (fe.ln) setFe((f) => ({ ...f, ln: "" }));
                      }}
                      autoComplete="family-name"
                    />
                  </div>
                  <HqFieldError>{fe.ln}</HqFieldError>
                </div>
                <button
                  type="button"
                  className="w-full rounded-xl py-3.5 text-sm font-extrabold text-white"
                  style={{ background: ND }}
                  onClick={() => {
                    setErr("");
                    const a = requiredText(firstName, "όνομα");
                    const b = requiredText(lastName, "επίθετο");
                    if (a || b) {
                      setFe({ ...(a && { fn: a }), ...(b && { ln: b }) });
                      return;
                    }
                    setStep(1);
                  }}
                >
                  Επόμενο
                </button>
              </>
            )}

            {step === 1 && (
              <>
                <div>
                  <HqLabel className="!text-[#64748B]" required>
                    Email
                  </HqLabel>
                  <div className="relative mt-1.5">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className={["w-full rounded-xl border py-3 pl-10 pr-3 text-sm", fe.email ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25"].join(" ")}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (fe.email) setFe((f) => ({ ...f, email: "" }));
                      }}
                      type="email"
                      autoComplete="email"
                    />
                  </div>
                  <HqFieldError>{fe.email}</HqFieldError>
                </div>
                <div>
                  <HqLabel className="!text-[#64748B]">Τηλέφωνο (10 ψηφία, προαιρετικό)</HqLabel>
                  <div className="relative mt-1.5">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className={["w-full rounded-xl border py-3 pl-10 pr-3 text-sm", fe.phone ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25"].join(" ")}
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (fe.phone) setFe((f) => ({ ...f, phone: "" }));
                      }}
                      autoComplete="tel"
                    />
                  </div>
                  <HqFieldError>{fe.phone}</HqFieldError>
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
                    onClick={() => {
                      setErr("");
                      setFe({});
                      const em = validateEmail(email);
                      const ph = validatePhone10(phone, false);
                      if (em || ph) {
                        setFe({ ...(em && { email: em }), ...(ph && { phone: ph }) });
                        return;
                      }
                      setStep(2);
                    }}
                  >
                    Επόμενο
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <HqLabel className="!text-[#64748B]" required>Κωδικός (ελάχ. 6)</HqLabel>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className={["w-full rounded-xl border py-3 pl-10 pr-3 text-sm", fe.pw1 ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25"].join(" ")}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (fe.pw1) setFe((f) => ({ ...f, pw1: "" }));
                      }}
                      type="password"
                      autoComplete="new-password"
                      minLength={6}
                    />
                  </div>
                  <HqFieldError>{fe.pw1}</HqFieldError>
                </div>
                <div>
                  <HqLabel className="!text-[#64748B]" required>Επιβεβαίωση κωδικού</HqLabel>
                  <div className="relative mt-1.5">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      className={["w-full rounded-xl border py-3 pl-10 pr-3 text-sm", fe.pw2 ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25"].join(" ")}
                      value={password2}
                      onChange={(e) => {
                        setPassword2(e.target.value);
                        if (fe.pw2) setFe((f) => ({ ...f, pw2: "" }));
                      }}
                      type="password"
                      autoComplete="new-password"
                    />
                  </div>
                  <HqFieldError>{fe.pw2}</HqFieldError>
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
