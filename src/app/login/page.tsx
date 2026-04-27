"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { lux } from "@/lib/luxury-styles";
import { mapAuthErrorToGreek, validateEmail } from "@/lib/form-validation";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import "./login.css";

const HERO = "/hero-karagkounis.png";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({});
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent" | "err">("idle");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setFieldErr({});
    setForgotStatus("idle");
    const em = validateEmail(email);
    if (em) {
      setFieldErr({ email: em });
      return;
    }
    if (!password) {
      setFieldErr({ password: "Υποχρεωτικός κωδικός" });
      return;
    }
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (authError) {
      setError(mapAuthErrorToGreek(authError.message));
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  };

  const onForgotPassword = async () => {
    setError(null);
    setForgotStatus("idle");
    const em = validateEmail(email);
    if (em) {
      setFieldErr({ email: em });
      setForgotStatus("err");
      return;
    }
    setForgotStatus("sending");
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: origin ? `${origin}/login` : undefined,
    });
    if (err) {
      setForgotStatus("err");
      setError(mapAuthErrorToGreek(err.message));
      return;
    }
    setForgotStatus("sent");
  };

  return (
    <main className="flex min-h-screen w-full flex-col bg-[#0a1628] lg:flex-row">
      {/* Left — 60%: hero + overlay + subtle branding */}
      <div
        className="relative order-2 flex min-h-[36vh] w-full flex-1 flex-col justify-end overflow-hidden lg:order-1 lg:min-h-0 lg:w-[60%] lg:flex-none"
        style={{
          backgroundImage: `linear-gradient(105deg, rgba(6, 15, 35, 0.88) 0%, rgba(10, 30, 58, 0.65) 45%, rgba(8, 20, 45, 0.75) 100%), url(${HERO})`,
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(6, 12, 28, 0.2) 0%, rgba(4, 10, 24, 0.55) 100%)",
          }}
        />
        <p className="relative z-10 px-6 pb-8 pt-4 text-[11px] font-medium tracking-[0.2em] text-[#C9A84C] md:px-10 md:pb-10">
          Καραγκούνης CRM
        </p>
      </div>

      {/* Right — 40%: ambient + card */}
      <div className="login-crm-right relative order-1 flex w-full flex-1 flex-col items-center justify-center overflow-hidden px-5 py-10 sm:px-8 lg:order-2 lg:w-[40%] lg:flex-none lg:px-12">
        <div className="login-aurora absolute inset-0 z-0" aria-hidden />
        <div
          className="login-particle left-[8%] top-[12%] h-24 w-24 opacity-40 blur-2xl"
          aria-hidden
        />
        <div
          className="login-particle right-[5%] top-[40%] h-32 w-32 opacity-30 blur-3xl"
          aria-hidden
        />
        <div
          className="login-particle bottom-[15%] left-[20%] h-16 w-16 opacity-35 blur-xl"
          aria-hidden
        />
        <div
          className="login-particle right-[25%] top-[8%] h-10 w-10 opacity-25 blur-md"
          aria-hidden
        />

        <form
          onSubmit={onSubmit}
          className="relative z-10 w-full max-w-[400px] rounded-2xl border border-slate-200/90 bg-white p-8 shadow-[0_4px_40px_rgba(10,22,40,0.08),0_0_0_1px_rgba(255,255,255,0.8)]"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <div
              className="mb-5 flex h-10 w-10 items-center justify-center rounded-full text-[12px] font-bold tracking-tight text-white shadow-[0_0_0_1px_rgba(201,168,76,0.35),0_8px_24px_rgba(201,168,76,0.25)]"
              style={{ background: "linear-gradient(145deg, #C9A84C 0%, #8B6914 100%)" }}
            >
              KK
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Είσοδος</h1>
            <p className="mt-1.5 text-xs text-slate-500">Σύστημα Διαχείρισης Γραφείου</p>
          </div>

          <div className="space-y-4">
            <div>
              <HqLabel htmlFor="em" className="text-slate-600" required>
                Email
              </HqLabel>
              <div className="relative mt-1.5">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="em"
                  className={[
                    "h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50/80 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400",
                    "transition focus:border-[#C9A84C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20",
                    fieldErr.email ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : "",
                  ].join(" ")}
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErr.email) setFieldErr((f) => ({ ...f, email: undefined }));
                  }}
                  autoComplete="email"
                  aria-invalid={!!fieldErr.email}
                />
              </div>
              <HqFieldError>{fieldErr.email}</HqFieldError>
            </div>

            <div>
              <HqLabel htmlFor="pw" className="text-slate-600" required>
                Κωδικός
              </HqLabel>
              <div className="relative mt-1.5">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="pw"
                  className={[
                    "h-[44px] w-full rounded-lg border border-slate-200 bg-slate-50/80 py-2 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400",
                    "transition focus:border-[#C9A84C] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/20",
                    fieldErr.password ? "border-red-400 focus:border-red-500 focus:ring-red-500/20" : "",
                  ].join(" ")}
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldErr.password) setFieldErr((f) => ({ ...f, password: undefined }));
                  }}
                  autoComplete="current-password"
                  aria-invalid={!!fieldErr.password}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Απόκρυψη κωδικού" : "Εμφάνιση κωδικού"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <HqFieldError>{fieldErr.password}</HqFieldError>
            </div>
          </div>

          {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
          {forgotStatus === "sent" && (
            <p className="mt-3 text-center text-xs text-slate-600">
              Αν υπάρχει λογαριασμός, στάλθηκε σύνδεση επαναφοράς στο email σας.
            </p>
          )}

          <button
            type="submit"
            className={[
              lux.btnGold,
              "mt-6 w-full !py-3.5 !text-base font-semibold",
              "h-12 min-h-[48px] min-w-0",
            ].join(" ")}
          >
            Είσοδος
          </button>

          <div className="mt-5 text-center">
            <button
              type="button"
              className="text-xs text-slate-600 underline-offset-2 transition hover:text-slate-900 hover:underline disabled:opacity-50"
              onClick={() => void onForgotPassword()}
              disabled={forgotStatus === "sending"}
            >
              {forgotStatus === "sending" ? "Αποστολή…" : "Ξεχάσατε τον κωδικό σας;"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
