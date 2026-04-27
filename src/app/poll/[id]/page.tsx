import { Suspense } from "react";
import { PublicPollContent } from "./poll-content";
import { lux } from "@/lib/luxury-styles";

export default function PublicPollPage() {
  return (
    <Suspense
      fallback={
        <div className={`min-h-dvh ${lux.pageBg} flex items-center justify-center p-4`}>
          <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
        </div>
      }
    >
      <PublicPollContent />
    </Suspense>
  );
}
