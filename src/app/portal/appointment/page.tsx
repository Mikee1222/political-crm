import { Suspense } from "react";
import { PortalAppointmentContent } from "./appointment-content";
import { lux } from "@/lib/luxury-styles";

export default function PortalAppointmentPage() {
  return (
    <Suspense
      fallback={
        <div className={`min-h-dvh ${lux.pageBg} flex items-center justify-center p-6`}>
          <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
        </div>
      }
    >
      <PortalAppointmentContent />
    </Suspense>
  );
}
