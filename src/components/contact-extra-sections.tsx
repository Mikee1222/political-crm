"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { formatDateTimeAthens } from "@/lib/date-format";
import { lux } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";
import { ContactDocumentsSection } from "@/components/contact-documents-section";

type ApptRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  citizen_name: string | null;
};

const card =
  "contact-card-in break-inside-avoid rounded-[12px] border border-[var(--border)] bg-[var(--bg-card)]/95 p-5 shadow-sm";

export function ContactExtraSections({
  contactId,
  phone,
  canManage,
}: {
  contactId: string;
  phone: string | null;
  canManage: boolean;
}) {
  const [appts, setAppts] = useState<ApptRow[]>([]);
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    if (!canManage) return;
    try {
      const ar = await fetchWithTimeout(`/api/contacts/${encodeURIComponent(contactId)}/appointments`);
      if (ar.ok) {
        try {
          const j = (await ar.json()) as { appointments?: ApptRow[] };
          setAppts(j.appointments ?? []);
        } catch {
          setAppts([]);
        }
      } else {
        setAppts([]);
      }
    } catch {
      setAppts([]);
    }
  }, [canManage, contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canManage) {
    return null;
  }

  const base = typeof window !== "undefined" ? window.location.origin : "";
  const regUrl = `${base}/portal/register?contact=${encodeURIComponent(contactId)}&phone=${encodeURIComponent(phone ?? "")}`;
  const qrSrc = `/api/qrcode?url=${encodeURIComponent(regUrl)}&size=240`;

  return (
    <div className="col-span-full flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
          >
            <QrCode className="h-3.5 w-3.5" />
            QR portal
          </button>
        </div>
      </div>

      <div className={card + " !border-l-[#003476]"}>
        <h2 className="mb-3 text-sm font-semibold">Ραντεβού (portal)</h2>
        {appts.length === 0 ? <p className="text-sm text-[var(--text-muted)]">Δεν υπάρχουν καταχωρήσεις.</p> : null}
        <ul className="space-y-2">
          {appts.map((a) => (
            <li key={a.id} className="text-sm text-[var(--text-secondary)]">
              {formatDateTimeAthens(a.starts_at)} – {a.reason || "—"}
            </li>
          ))}
        </ul>
      </div>

      <ContactDocumentsSection contactId={contactId} />

      <CenteredModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        title="QR portal"
        className="max-w-sm"
        ariaLabel="QR εγγραφής portal"
        footer={
          <button type="button" className={lux.btnSecondary} onClick={() => setQrOpen(false)}>
            Άκυρο
          </button>
        }
      >
        <p className="mb-3 text-center text-sm text-[var(--text-secondary)]">Σκανάρετε για εγγραφή portal</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrSrc} alt="" className="mx-auto h-48 w-48" />
      </CenteredModal>
    </div>
  );
}
