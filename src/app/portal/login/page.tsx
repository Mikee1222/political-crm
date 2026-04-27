"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Lock, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { mapAuthErrorToGreek, validateEmail } from "@/lib/form-validation";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";
import { FormSubmitButton } from "@/components/ui/form-submit-button";
import { useFormToast } from "@/contexts/form-toast-context";

const ND = "#003476";

function portalPostLoginDest(next: string | null | undefined): string {
  const n = (next ?? "").trim();
  if (!n.startsWith("/portal")) {
    return "/portal/dashboard";
  }
  if (n === "/portal" || n === "/portal/") {
    return "/portal/dashboard";
  }
  return n;
}

function PortalLoginInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [loading, setLoading] = useState(false);
  const { showToast } = useFormToast();

  const nextRaw = sp.get("next");
  const destination = portalPostLoginDest(nextRaw);

  return (
    <div className="flex min-h-[-webkit-fill-available] min-h-dvh flex-col bg-[#FAFBFC]">
      <div className="border-b border-[#E2E8F0] bg-white px-4 py-3 shadow-sm sm:px-6">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link href="/portal" className="text-sm font-bold" style={{ color: ND }}>
            ← Αρχική
          </Link>
          <Link href="/portal/register" className="text-sm font-semibold text-[#64748B] hover:underline">
            Εγγραφή
          </Link>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
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
            Σύνδεση
          </h1>
          <p className="mt-1 text-center text-sm text-[#64748B]">Πρόσβαση πολιτών στην πύλη (διαφορετική από το προσωπικό CRM)</p>
          {err && (
            <p className="mt-4 text-center text-sm text-red-600" role="alert">
              {err}
            </p>
          )}
          <form
            className="mt-8 space-y-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setErr("");
              setFieldErr({});
              const em = validateEmail(email);
              if (em) {
                setFieldErr({ email: em });
                showToast(em, "error");
                return;
              }
              if (!password) {
                setFieldErr({ password: "Υποχρεωτικός κωδικός" });
                showToast("Συμπληρώστε τον κωδικό.", "error");
                return;
              }
              setLoading(true);
              try {
                const supabase = createClient();
                const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
                if (error) {
                  const msg = mapAuthErrorToGreek(error.message);
                  setErr(msg);
                  showToast(msg, "error");
                  return;
                }
                const res = await fetchWithTimeout("/api/portal/me", { credentials: "same-origin" });
                if (!res.ok) {
                  await supabase.auth.signOut();
                  const msg = "Λάθος τύπος λογαριασμού. Χρησιμοποιήστε /login για το προσωπικό CRM.";
                  setErr(msg);
                  showToast(msg, "error");
                  return;
                }
                showToast("Συνδεθήκατε επιτυχώς.", "success");
                router.push(destination);
                router.refresh();
              } catch {
                const msg = "Σφάλμα δικτύου. Δοκιμάστε ξανά.";
                setErr(msg);
                showToast(msg, "error");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div>
              <HqLabel htmlFor="e" className="!text-[#64748B]" required>
                Email
              </HqLabel>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="e"
                  className={[
                    "w-full rounded-xl border py-3 pl-10 pr-3 text-sm text-[#1A1A2E] outline-none transition",
                    fieldErr.email ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25",
                  ].join(" ")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErr.email) setFieldErr((f) => ({ ...f, email: undefined }));
                  }}
                  onBlur={() => {
                    const em = validateEmail(email);
                    if (em) setFieldErr((f) => ({ ...f, email: em }));
                    else setFieldErr((f) => ({ ...f, email: undefined }));
                  }}
                  type="email"
                  autoComplete="email"
                  placeholder="email@παράδειγμα.gr"
                />
              </div>
              <HqFieldError>{fieldErr.email}</HqFieldError>
            </div>
            <div>
              <HqLabel htmlFor="p" className="!text-[#64748B]" required>
                Κωδικός
              </HqLabel>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="p"
                  className={[
                    "w-full rounded-xl border py-3 pl-10 pr-3 text-sm text-[#1A1A2E] outline-none",
                    fieldErr.password ? "border-red-400" : "border-[#E2E8F0] focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25",
                  ].join(" ")}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErr.password) setFieldErr((f) => ({ ...f, password: undefined }));
                  }}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
              <HqFieldError>{fieldErr.password}</HqFieldError>
            </div>
            <FormSubmitButton
              type="submit"
              variant="gold"
              loading={loading}
              className="w-full !rounded-xl !py-3.5 !text-sm !font-extrabold shadow-md"
            >
              Είσοδος
            </FormSubmitButton>
          </form>
          <p className="mt-2 text-center text-sm text-[#64748B]">
            Δεν έχετε λογαριασμό;{" "}
            <Link href="/portal/register" className="font-extrabold hover:underline" style={{ color: ND }}>
              Εγγραφή
            </Link>
          </p>
          <p className="mt-6 text-center text-xs text-[#94A3B8]">Εγγεγραμμένοι πολίτες: 1.234+</p>
        </div>
      </div>
    </div>
  );
}

export default function PortalLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#FAFBFC] text-sm text-[#64748B]">
          Φόρτωση…
        </div>
      }
    >
      <PortalLoginInner />
    </Suspense>
  );
}
