"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";

type Slot = { start: string; end: string };

export function PortalAppointmentContent() {
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

  const loadSlots = useCallback(async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setLoading(true);
    setErr(null);
    const res = await fetchWithTimeout(`/api/portal/appointments/slots?date=${encodeURIComponent(date)}`);
    const j = (await res.json().catch(() => ({}))) as { slots?: Slot[]; error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Σφάλμα");
      setSlots([]);
      setLoading(false);
      return;
    }
    setSlots(j.slots ?? []);
    setPick(null);
    setLoading(false);
  }, [date]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !pick) {
      setErr("Συμπληρώστε όλα τα πεδία");
      return;
    }
    setErr(null);
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
      setErr(j.error ?? "Σφάλμα");
      return;
    }
    setOk(true);
  };

  if (ok) {
    return (
      <div className={`min-h-dvh ${lux.pageBg} flex flex-col items-center justify-center p-6`}>
        <div className={lux.card + " max-w-md text-center"}>
          <h1 className={lux.pageTitle}>Ραντεβού κλείστηκε</h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">Θα λάβετε επιβεβαίωση με email, εφόσον το έχετε δηλώσει.</p>
        </div>
      </div>
    );
  }

  if (!contact) {
    return (
      <div className={`min-h-dvh ${lux.pageBg} flex items-center justify-center p-4`}>
        <p className="text-sm text-amber-200">Χρειάζεται σύνδεσμος από το γραφείο (επαφή).</p>
      </div>
    );
  }

  return (
    <div className={`min-h-dvh ${lux.pageBg} p-4 py-8`}>
      <div className="mx-auto max-w-lg">
        <h1 className="mb-2 text-xl font-bold text-[var(--text-primary)]">Κλείστε ραντεβού</h1>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">Η τελική αποδοχή πραγματοποιείται από το γραφείο.</p>
        <form onSubmit={book} className="space-y-4">
          {err && <p className="text-sm text-red-200">{err}</p>}
          <div>
            <label className={lux.label} htmlFor="d">
              Ημέρα
            </label>
            <input
              id="d"
              type="date"
              className={lux.input}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
              }}
            />
          </div>
          <div>
            <p className="text-xs text-[var(--text-muted)]">Ώρα (30’)</p>
            {loading && <p className="text-sm">Φόρτωση…</p>}
            {!loading && (slots?.length === 0 ? <p className="text-sm text-amber-200">Δεν υπάρχουν κενά.</p> : null)}
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {(slots ?? []).map((s) => (
                <li key={s.start}>
                  <button
                    type="button"
                    onClick={() => setPick(s)}
                    className={
                      (pick?.start === s.start ? "border-[#C9A84C] bg-[#C9A84C]/10 " : "border-[var(--border)] ") +
                      "w-full rounded-lg border px-3 py-2 text-left text-sm"
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
            <label className={lux.label} htmlFor="n">
              Ονοματεπώνυμο
            </label>
            <input id="n" className={lux.input} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className={lux.label} htmlFor="p">
              Τηλέφωνο
            </label>
            <input id="p" className={lux.input} value={phoneIn} onChange={(e) => setPhoneIn(e.target.value)} required />
          </div>
          <div>
            <label className={lux.label} htmlFor="r">
              Θέμα συνάντησης
            </label>
            <textarea id="r" className={lux.textarea} rows={4} value={reason} onChange={(e) => setReason(e.target.value)} required />
          </div>
          <button type="submit" className={lux.btnPrimary + " w-full !py-3"} disabled={!pick}>
            Αίτημα ραντεβού
          </button>
        </form>
      </div>
    </div>
  );
}
