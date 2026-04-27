"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { portalDisplayFirstName } from "@/lib/portal-display";
import { HqFieldError, HqLabel } from "@/components/ui/hq-form-primitives";
import { minLength, requiredText } from "@/lib/form-validation";

const ND = "#003476";
const inputBase =
  "w-full rounded-xl border border-[#E2E8F0] bg-white py-3 px-3 text-sm text-[#1A1A2E] outline-none transition focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25";

const STEPS = ["Στοιχεία", "Περιγραφή", "Επιβεβαίωση"] as const;

export default function NewPortalRequestPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [cats, setCats] = useState<string[]>([]);
  const [me, setMe] = useState<{
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null>(null);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/portal/login?next=/portal/requests/new");
        return;
      }
      const m = await fetchWithTimeout("/api/portal/me", { credentials: "same-origin" });
      if (!m.ok) {
        router.replace("/portal/login?next=/portal/requests/new");
        return;
      }
      const mj = (await m.json()) as {
        portal: { email: string; first_name: string; last_name: string; phone: string | null };
      };
      setMe(mj.portal);
      const { data: rc } = await supabase.from("request_categories").select("name").order("sort_order", { ascending: true });
      setCats((rc ?? []).map((x: { name: string }) => x.name));
    })();
  }, [router]);

  const onSubmit = useCallback(async () => {
    setFieldErr({});
    const t = requiredText(title, "τίτλος");
    const c = !category ? "Επιλέξτε κατηγορία" : null;
    if (t || c) {
      setFieldErr({ ...(t && { title: t }), ...(c && { category: c }) });
      setErr("Ελέγξτε τα πεδία");
      return;
    }
    const d = minLength(description, 3, "Η περιγραφή πρέπει να έχει τουλάχιστον 3 χαρακτήρες");
    if (d) {
      setFieldErr({ description: d });
      setErr(d);
      return;
    }
    setErr("");
    setSending(true);
    try {
      const res = await fetchWithTimeout("/api/portal/requests", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description, category }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; request?: { id: string } };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      if (j.request?.id) {
        router.push(`/portal/requests/${j.request.id}`);
      } else {
        router.push("/portal/requests");
      }
    } catch {
      setErr("Δικτυακό σφάλμα");
    } finally {
      setSending(false);
    }
  }, [title, description, category, router]);

  const goNext0 = () => {
    setFieldErr({});
    const t = requiredText(title, "τίτλος");
    if (t) {
      setFieldErr({ title: t });
      return;
    }
    if (!category) {
      setFieldErr({ category: "Επιλέξτε κατηγορία" });
      return;
    }
    setStep(1);
  };

  const goNext1 = () => {
    setFieldErr({});
    const d = minLength(description, 3, "Τουλάχιστον 3 χαρακτήρες");
    if (d) {
      setFieldErr({ description: d });
      return;
    }
    setStep(2);
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-[640px] px-4 py-8 sm:px-6 sm:py-10">
      <p className="mb-2">
        <Link href="/portal/requests" className="text-sm font-bold hover:underline" style={{ color: ND }}>
          ← Όλα τα αιτήματα
        </Link>
      </p>

      <h1 className="text-2xl font-extrabold" style={{ color: ND }}>
        Νέο αίτημα
      </h1>

      <p className="mt-1 text-sm text-[#64748B]">Βήμα {step + 1} / 3</p>

      <div className="mb-2 mt-4 flex w-full max-w-md mx-auto items-center justify-center gap-1" aria-label="Βήματα">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                style={
                  i <= step
                    ? { background: ND, color: "white" }
                    : { background: "#E2E8F0", color: "#64748B" }
                }
                aria-current={i === step ? "step" : undefined}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className="hidden text-[9px] font-bold uppercase text-[#64748B] sm:block">{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className="mx-1 w-4 border-t-2 sm:w-8" style={{ borderColor: i < step ? ND : "#E2E8F0" }} aria-hidden />}
          </div>
        ))}
      </div>
      <p className="text-center text-xs font-bold uppercase tracking-wider text-[#64748B]">{STEPS[step]}</p>

      {me && (
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-[#64748B]">
            <User className="h-5 w-5" />
          </div>
          <div className="min-w-0 text-sm text-[#64748B]">
            <p className="font-bold text-[#1A1A2E]">{portalDisplayFirstName(me)}</p>
            <p className="font-mono text-xs">
              {me.first_name} {me.last_name}
            </p>
            <p className="mt-0.5">{me.email}</p>
            {me.phone && <p>Τηλ. {me.phone}</p>}
          </div>
        </div>
      )}

      {err && <p className="mt-4 text-center text-sm text-red-600" role="alert">{err}</p>}

      {step === 0 && (
        <div className="mt-6 space-y-4">
          <div>
            <HqLabel htmlFor="pt" required>
              Τίτλος αιτήματος
            </HqLabel>
            <input
              id="pt"
              className={[inputBase, fieldErr.title ? "border-red-400" : ""].join(" ")}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErr.title) setFieldErr((f) => ({ ...f, title: "" }));
              }}
              aria-invalid={!!fieldErr.title}
            />
            <HqFieldError>{fieldErr.title}</HqFieldError>
          </div>
          <div>
            <HqLabel required>Κατηγορία</HqLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCategory(c);
                    if (fieldErr.category) setFieldErr((f) => ({ ...f, category: "" }));
                  }}
                  className={[
                    "rounded-full border-2 px-3 py-2 text-sm font-bold transition",
                    category === c
                      ? "text-white"
                      : "border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#003476]/30",
                  ].join(" ")}
                  style={category === c ? { background: ND, borderColor: ND } : undefined}
                >
                  {c}
                </button>
              ))}
            </div>
            <HqFieldError>{fieldErr.category}</HqFieldError>
            {cats.length === 0 && <p className="text-sm text-amber-700">Δεν φορτώθηκαν κατηγορίες.</p>}
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-3.5 text-sm font-extrabold text-white transition hover:brightness-110 disabled:opacity-50"
            style={{ background: ND }}
            onClick={goNext0}
          >
            Επόμενο
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <div>
            <HqLabel htmlFor="pd" required>
              Περιγραφή
            </HqLabel>
            <textarea
              id="pd"
              className={["min-h-[200px] rounded-xl border p-3 text-sm leading-relaxed focus:border-[#C9A84C] focus:ring-2 focus:ring-[#C9A84C]/25", fieldErr.description ? "border-red-400" : "border-[#E2E8F0]"].join(" ")}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (fieldErr.description) setFieldErr((f) => ({ ...f, description: "" }));
              }}
              placeholder="Περιγράψτε αναλυτικά το ζήτημά σας…"
            />
            <HqFieldError>{fieldErr.description}</HqFieldError>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[#E2E8F0] py-3 text-sm font-bold"
              onClick={() => setStep(0)}
            >
              <ChevronLeft className="h-4 w-4" />
              Πίσω
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1 rounded-xl py-3.5 text-sm font-extrabold text-white transition hover:brightness-110"
              style={{ background: ND }}
              onClick={goNext1}
            >
              Επόμενο
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-[#E2E8F0] bg-[#F8FAFC] p-5 text-sm text-[#1A1A2E]">
            <p>
              <span className="font-bold text-[#64748B]">Τίτλος: </span>
              {title}
            </p>
            <p className="mt-2">
              <span className="font-bold text-[#64748B]">Κατηγορία: </span> {category}
            </p>
            <p className="mt-2 whitespace-pre-wrap">
              <span className="font-bold text-[#64748B]">Περιγραφή: </span>
              {description.trim() || "—"}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-[#E2E8F0] py-3 text-sm font-bold"
              onClick={() => setStep(1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Πίσω
            </button>
            <button
              type="button"
              className="flex flex-1 items-center justify-center rounded-xl py-3.5 text-sm font-extrabold text-[#0f172a] transition hover:brightness-110 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #C9A84C, #8B6914)" }}
              onClick={() => void onSubmit()}
              disabled={sending}
            >
              {sending ? "Υποβολή…" : "Υποβολή αιτήματος"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
