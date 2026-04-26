"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-8 text-center text-[var(--text-primary)]">
      <p className="text-sm">Κάτι πήγε στραβά, ανανεώστε τη σελίδα</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-sm"
      >
        Δοκιμάστε ξανά
      </button>
    </div>
  );
}
