/** Canonical request status labels (Lighthouse CRM alignment). */
export const REQUEST_STATUS_OPEN = "Ανοικτό";
export const REQUEST_STATUS_COMPLETED_SUCCESS = "Κλειστό - ολοκληρωμένο με επιτυχία";
export const REQUEST_STATUS_COMPLETED_FAILURE = "Κλειστό - ολοκληρωμένο χωρίς επιτυχία";
export const REQUEST_STATUS_IMPOSSIBLE = "Κλειστό - δεν είναι δυνατή η πραγματοποίησή του";

export const REQUEST_STATUSES = [
  REQUEST_STATUS_OPEN,
  REQUEST_STATUS_COMPLETED_SUCCESS,
  REQUEST_STATUS_COMPLETED_FAILURE,
  REQUEST_STATUS_IMPOSSIBLE,
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

const REQUEST_STATUS_ALIASES: Record<string, RequestStatus> = {
  [REQUEST_STATUS_OPEN]: REQUEST_STATUS_OPEN,
  Νέο: REQUEST_STATUS_OPEN,
  "Σε εξέλιξη": REQUEST_STATUS_OPEN,
  [REQUEST_STATUS_COMPLETED_SUCCESS]: REQUEST_STATUS_COMPLETED_SUCCESS,
  Ολοκληρώθηκε: REQUEST_STATUS_COMPLETED_SUCCESS,
  [REQUEST_STATUS_COMPLETED_FAILURE]: REQUEST_STATUS_COMPLETED_FAILURE,
  Απορρίφθηκε: REQUEST_STATUS_COMPLETED_FAILURE,
  "Κλειστό χωρίς επιτυχία": REQUEST_STATUS_COMPLETED_FAILURE,
  [REQUEST_STATUS_IMPOSSIBLE]: REQUEST_STATUS_IMPOSSIBLE,
};

export function isCanonicalRequestStatus(status: string): status is RequestStatus {
  return (REQUEST_STATUSES as readonly string[]).includes(status);
}

export function normalizeRequestStatus(status: string | null | undefined): string {
  const raw = String(status ?? "").trim();
  if (!raw) return REQUEST_STATUS_OPEN;
  return REQUEST_STATUS_ALIASES[raw] ?? raw;
}

const REQUEST_STATUS_QUERY_VALUES: Record<RequestStatus, readonly string[]> = {
  [REQUEST_STATUS_OPEN]: [REQUEST_STATUS_OPEN, "Νέο", "Σε εξέλιξη"],
  [REQUEST_STATUS_COMPLETED_SUCCESS]: [REQUEST_STATUS_COMPLETED_SUCCESS, "Ολοκληρώθηκε"],
  [REQUEST_STATUS_COMPLETED_FAILURE]: [
    REQUEST_STATUS_COMPLETED_FAILURE,
    "Απορρίφθηκε",
    "Κλειστό χωρίς επιτυχία",
  ],
  [REQUEST_STATUS_IMPOSSIBLE]: [REQUEST_STATUS_IMPOSSIBLE],
};

export function getRequestStatusQueryValues(status: string | null | undefined): string[] {
  const normalized = normalizeRequestStatus(status);
  if (isCanonicalRequestStatus(normalized)) {
    return [...REQUEST_STATUS_QUERY_VALUES[normalized]];
  }
  return normalized ? [normalized] : [...REQUEST_STATUS_QUERY_VALUES[REQUEST_STATUS_OPEN]];
}

export const OPEN_REQUEST_STATUSES = new Set<string>(
  REQUEST_STATUS_QUERY_VALUES[REQUEST_STATUS_OPEN],
);

export const CLOSED_REQUEST_STATUSES = new Set<string>([
  ...REQUEST_STATUS_QUERY_VALUES[REQUEST_STATUS_COMPLETED_SUCCESS],
  ...REQUEST_STATUS_QUERY_VALUES[REQUEST_STATUS_COMPLETED_FAILURE],
  ...REQUEST_STATUS_QUERY_VALUES[REQUEST_STATUS_IMPOSSIBLE],
]);

export function isOpenRequestStatus(status: string | null | undefined): boolean {
  return normalizeRequestStatus(status) === REQUEST_STATUS_OPEN;
}

export function isClosedRequestStatus(status: string | null | undefined): boolean {
  const normalized = normalizeRequestStatus(status);
  return (
    normalized === REQUEST_STATUS_COMPLETED_SUCCESS ||
    normalized === REQUEST_STATUS_COMPLETED_FAILURE ||
    normalized === REQUEST_STATUS_IMPOSSIBLE
  );
}

export function isSuccessfulRequestStatus(status: string | null | undefined): boolean {
  return normalizeRequestStatus(status) === REQUEST_STATUS_COMPLETED_SUCCESS;
}

export function isFailedRequestStatus(status: string | null | undefined): boolean {
  const normalized = normalizeRequestStatus(status);
  return (
    normalized === REQUEST_STATUS_COMPLETED_FAILURE ||
    normalized === REQUEST_STATUS_IMPOSSIBLE
  );
}

/** Badge classes aligned with Lighthouse status colors. */
export const REQUEST_STATUS_BADGE_CLASSES: Record<RequestStatus, string> = {
  [REQUEST_STATUS_OPEN]:
    "bg-amber-500/15 text-amber-900 ring-1 ring-inset ring-orange-500/30 dark:text-amber-200",
  [REQUEST_STATUS_COMPLETED_SUCCESS]:
    "bg-emerald-500/15 text-emerald-800 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-200",
  [REQUEST_STATUS_COMPLETED_FAILURE]:
    "bg-red-500/15 text-red-800 ring-1 ring-inset ring-red-500/25 dark:text-red-200",
  [REQUEST_STATUS_IMPOSSIBLE]:
    "bg-zinc-500/15 text-zinc-700 ring-1 ring-inset ring-zinc-500/25 dark:text-zinc-300",
};

/** Tailwind utility classes for light contact-detail badges. */
export const REQUEST_STATUS_CONTACT_BADGE: Record<RequestStatus, string> = {
  [REQUEST_STATUS_OPEN]:
    "bg-amber-500/15 text-amber-900 ring-1 ring-orange-500/30 dark:text-amber-200",
  [REQUEST_STATUS_COMPLETED_SUCCESS]:
    "bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/25 dark:text-emerald-200",
  [REQUEST_STATUS_COMPLETED_FAILURE]:
    "bg-red-500/15 text-red-800 ring-1 ring-red-500/25 dark:text-red-200",
  [REQUEST_STATUS_IMPOSSIBLE]:
    "bg-zinc-500/15 text-zinc-700 ring-1 ring-zinc-500/25 dark:text-zinc-300",
};

export const REQUEST_STATUS_KANBAN_META: Record<
  RequestStatus,
  { color: string; dotClass: string }
> = {
  [REQUEST_STATUS_OPEN]: {
    color: "border-orange-500",
    dotClass: "text-orange-500 fill-orange-500",
  },
  [REQUEST_STATUS_COMPLETED_SUCCESS]: {
    color: "border-green-500",
    dotClass: "text-green-500 fill-green-500",
  },
  [REQUEST_STATUS_COMPLETED_FAILURE]: {
    color: "border-red-500",
    dotClass: "text-red-500 fill-red-500",
  },
  [REQUEST_STATUS_IMPOSSIBLE]: {
    color: "border-zinc-400",
    dotClass: "text-zinc-400 fill-zinc-400",
  },
};
