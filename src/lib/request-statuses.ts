/** Canonical request status labels (Lighthouse CRM alignment). */
export const REQUEST_STATUSES = [
  "Νέο",
  "Σε εξέλιξη",
  "Ολοκληρώθηκε",
  "Απορρίφθηκε",
  "Κλειστό χωρίς επιτυχία",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const OPEN_REQUEST_STATUSES = new Set<string>(["Νέο", "Σε εξέλιξη"]);

export const CLOSED_REQUEST_STATUSES = new Set<string>([
  "Ολοκληρώθηκε",
  "Απορρίφθηκε",
  "Κλειστό χωρίς επιτυχία",
]);

export function isClosedRequestStatus(status: string | null | undefined): boolean {
  return CLOSED_REQUEST_STATUSES.has(status ?? "");
}

/** CSS variable–based badge classes (dark/light via globals.css). */
export const REQUEST_STATUS_BADGE_CLASSES: Record<string, string> = {
  Νέο: "bg-[var(--status-req-new-bg)] text-[var(--status-req-new-fg)] ring-1 ring-inset ring-[var(--status-req-new-ring)]",
  "Σε εξέλιξη":
    "bg-[var(--status-req-prog-bg)] text-[var(--status-req-prog-fg)] ring-1 ring-inset ring-[var(--status-req-prog-ring)]",
  Ολοκληρώθηκε:
    "bg-[var(--status-req-done-bg)] text-[var(--status-req-done-fg)] ring-1 ring-inset ring-[var(--status-req-done-ring)]",
  Απορρίφθηκε:
    "bg-[var(--status-req-rej-bg)] text-[var(--status-req-rej-fg)] ring-1 ring-inset ring-[var(--status-req-rej-ring)]",
  "Κλειστό χωρίς επιτυχία":
    "bg-[var(--status-req-closed-bg)] text-[var(--status-req-closed-fg)] ring-1 ring-inset ring-[var(--status-req-closed-ring)]",
};

/** Tailwind utility classes for light contact-detail badges. */
export const REQUEST_STATUS_CONTACT_BADGE: Record<string, string> = {
  Νέο: "bg-sky-500/15 text-sky-800 ring-1 ring-sky-500/25 dark:text-sky-200",
  "Σε εξέλιξη": "bg-amber-500/15 text-amber-900 ring-1 ring-amber-500/25 dark:text-amber-200",
  Ολοκληρώθηκε: "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200",
  Απορρίφθηκε: "bg-red-500/15 text-red-800 ring-1 ring-red-500/25 dark:text-red-200",
  "Κλειστό χωρίς επιτυχία": "bg-zinc-500/15 text-zinc-700 ring-1 ring-zinc-500/25 dark:text-zinc-300",
};
