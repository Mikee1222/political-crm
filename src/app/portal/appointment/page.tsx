import { Suspense } from "react";
import { PortalAppointmentContent } from "./appointment-content";
export default function PortalAppointmentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#FAFBFC] p-6">
          <p className="text-sm text-[#64748B]">Φόρτωση…</p>
        </div>
      }
    >
      <PortalAppointmentContent />
    </Suspense>
  );
}
