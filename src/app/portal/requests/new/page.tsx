"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { portalDisplayFirstName } from "@/lib/portal-display";

const ND = "#003476";

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
    if (!title.trim() || !category) {
      setErr("Συμπληρώστε τίτλο και κατηγορία");
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

  const canStep0 = title.trim() && category;
  const canStep1 = (description || "").trim().length >= 3;

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="mb-2">
        <Link href="/portal/requests" className="text-sm font-bold hover:underline" style={{ color: ND }}>
          ← Όλα τα αιτήματα
        </Link>
      </p>

      <h1 className="text-2xl font-extrabold" style={{ color: ND }}>
        Νέο αίτημα
      </h1>
      <p className="mt-1 text-sm text-[#64748B]">Βήμα {step + 1} / 3</p>

      <div className="mb-6 mt-4 flex items-center justify-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: i <= step ? ND : "#E2E8F0" }}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className="mx-1 w-4 border-t-2 sm:w-8" style={{ borderColor: i < step ? ND : "#E2E8F0" }} />}
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

      {err && <p className="mt-4 text-sm text-red-600">{err}</p>}

      {step === 0 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Τίτλος αιτήματος</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-[#E2E8F0] py-3 px-3 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Κατηγορία</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {cats.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
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
            {cats.length === 0 && <p className="text-sm text-amber-700">Δεν φορτώθηκαν κατηγορίες.</p>}
          </div>
          <button
            type="button"
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            style={{ background: ND }}
            disabled={!canStep0}
            onClick={() => setStep(1)}
          >
            Επόμενο
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]">Περιγραφή</label>
            <textarea
              className="mt-1.5 min-h-[200px] w-full rounded-xl border border-[#E2E8F0] p-3 text-sm leading-relaxed"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Περιγράψτε αναλυτικά το ζήτημά σας…"
            />
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
              className="flex flex-1 items-center justify-center gap-1 rounded-xl py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
              style={{ background: ND }}
              disabled={!canStep1}
              onClick={() => setStep(2)}
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
              className="flex flex-1 items-center justify-center rounded-xl py-3.5 text-sm font-extrabold text-[#0f172a] disabled:opacity-50"
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
