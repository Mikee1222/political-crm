"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { useFormToast } from "@/contexts/form-toast-context";

const ND = "#003476";

type Slot = { start: string; end: string };

const label = "mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-[#64748B]";
const input = "w-full rounded-xl border border-[#E2E8F0] bg-white px-3 py-2.5 text-sm text-[#1A1A2E]";

export function PortalAppointmentContent() {
  const { showToast } = useFormToast();
  const sp = useSearchParams();
  const contact = sp.get("contact") ?? "";
  const phone = sp.get("phone") ?? "";
  const [name, setName] = useState("");
  const [phoneIn, setPhoneIn] = useState(phone);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState<Slot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [booking, setBooking] = useState(false);

  const loadSlots = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return;
    }
    setLoading(true);
    setErr(null);
    const res = await fetchWithTimeout(`/api/portal/appointments/slots?date=${encodeURIComponent(date)}`);
    const j = (await res.json().catch(() => ({}))) as { slots?: Slot[]; error?: string };
    if (!res.ok) {
      const msg = j.error ?? "Σφάλμα";
      setErr(msg);
      showToast(msg, "error");
      setSlots([]);
      setLoading(false);
      return;
    }
    setSlots(j.slots ?? []);
    setPick(null);
    setLoading(false);
  }, [date, showToast]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !pick) {
      const msg = "Συμπληρώστε όλα τα πεδία";
      setErr(msg);
      showToast(msg, "error");
      return;
    }
    setErr(null);
    setBooking(true);
    try {
      const res = await fetchWithTimeout("/api/portal/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contact,
          phone: phoneIn,
          name: name || "—",
          reason,
          start: pick.start,
          end: pick.end,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const msg = j.error ?? "Σφάλμα";
        setErr(msg);
        showToast(msg, "error");
        return;
      }
      showToast("Το αίτημα ραντεβού στάλθηκε.", "success");
      setOk(true);
    } catch {
      const msg = "Σφάλμα δικτύου";
      setErr(msg);
      showToast(msg, "error");
    } finally {
      setBooking(false);
    }
  };

  if (ok) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#FAFBFC] p-6">
        <div className="max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-extrabold" style={{ color: ND }}>
            Ραντεβού κλείστηκε
          </h1>
          <p className="mt-2 text-sm text-[#64748B]">Θα λάβετε επιβεβαίωση με email, εφόσον το έχετε δηλώσει.</p>
          <Link href="/portal" className="mt-6 inline-block text-sm font-bold" style={{ color: ND }}>
            ← Αρχική πύλη
          </Link>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#FAFBFC] p-4">
        <p className="text-center text-sm text-amber-800">Χρειάζεται σύνδεσμος από το γραφείο (επαφή).</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#FAFBFC] p-4 py-8">
      <div className="mx-auto max-w-lg">
        <p className="mb-4">
          <Link href="/portal" className="text-sm font-extrabold" style={{ color: ND }}>
            ← Αρχική
          </Link>
        </p>
        <h1 className="mb-2 text-2xl font-extrabold" style={{ color: ND }}>
          Κλείστε ραντεβού
        </h1>
        <p className="mb-6 text-sm text-[#64748B]">Η τελική αποδοχή πραγματοποιείται από το γραφείο.</p>
        <form onSubmit={book} className="space-y-4">
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div>
            <label className={label} htmlFor="d">
              Ημέρα
            </label>
            <input
              id="d"
              type="date"
              className={input}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
          </div>
          <div>
            <p className="text-xs text-[#64748B]">Ώρα (30’)</p>
            {loading && <p className="text-sm">Φόρτωση…</p>}
            {!loading && (slots?.length === 0 ? <p className="text-sm text-amber-800">Δεν υπάρχουν κενά.</p> : null)}
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {(slots ?? []).map((s) => (
                <li key={s.start}>
                  <button
                    type="button"
                    onClick={() => setPick(s)}
                    className={
                      (pick?.start === s.start ? "border-[#C9A84C] bg-amber-50 " : "border-[#E2E8F0] ") +
                      "w-full rounded-lg border px-3 py-2 text-left text-sm text-[#1A1A2E]"
                    }
                  >
                    {new Date(s.start).toLocaleString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })} –{" "}
                    {new Date(s.end).toLocaleString("el-GR", { timeZone: "Europe/Athens", hour: "2-digit", minute: "2-digit" })}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className={label} htmlFor="n">
              Ονοματεπώνυμο
            </label>
            <input id="n" className={input} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={label} htmlFor="p">
              Τηλέφωνο
            </label>
            <input id="p" className={input} value={phoneIn} onChange={(e) => setPhoneIn(e.target.value)} required />
          </div>
          <div>
            <label className={label} htmlFor="r">
              Θέμα συνάντησης
            </label>
            <textarea
              id="r"
              className={input + " min-h-[100px] py-2"}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl py-3.5 text-sm font-extrabold text-white disabled:opacity-50"
            style={{ background: ND }}
            disabled={!pick || booking}
          >
            {booking ? "Υποβολή…" : "Αίτημα ραντεβού"}
          </button>
        </form>
      </div>
    </div>
  );
}
