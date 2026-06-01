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

export type RequestStatusStyle = {
  backgroundColor: string;
  color: string;
};

/** Light-theme badge colors (Lighthouse spec). */
export const REQUEST_STATUS_BADGE_LIGHT: Record<RequestStatus, RequestStatusStyle> = {
  [REQUEST_STATUS_OPEN]: { backgroundColor: "#FEF3C7", color: "#92400E" },
  [REQUEST_STATUS_COMPLETED_SUCCESS]: { backgroundColor: "#D1FAE5", color: "#065F46" },
  [REQUEST_STATUS_COMPLETED_FAILURE]: { backgroundColor: "#FEE2E2", color: "#991B1B" },
  [REQUEST_STATUS_IMPOSSIBLE]: { backgroundColor: "#F3F4F6", color: "#1F2937" },
};

/** Dark-theme badge colors — solid backgrounds for readable contrast. */
export const REQUEST_STATUS_BADGE_DARK: Record<RequestStatus, RequestStatusStyle> = {
  [REQUEST_STATUS_OPEN]: { backgroundColor: "#78350F", color: "#FEF3C7" },
  [REQUEST_STATUS_COMPLETED_SUCCESS]: { backgroundColor: "#065F46", color: "#D1FAE5" },
  [REQUEST_STATUS_COMPLETED_FAILURE]: { backgroundColor: "#991B1B", color: "#FEE2E2" },
  [REQUEST_STATUS_IMPOSSIBLE]: { backgroundColor: "#4B5563", color: "#F9FAFB" },
};

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

export function getCanonicalRequestStatus(status: string | null | undefined): RequestStatus {
  const normalized = normalizeRequestStatus(status);
  return isCanonicalRequestStatus(normalized) ? normalized : REQUEST_STATUS_OPEN;
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

function requestStatusBadgeClassesFor(key: RequestStatus): string {
  const light = REQUEST_STATUS_BADGE_LIGHT[key];
  const dark = REQUEST_STATUS_BADGE_DARK[key];
  return [
    `bg-[${dark.backgroundColor}] text-[${dark.color}]`,
    `[data-theme='light']:bg-[${light.backgroundColor}]`,
    `[data-theme='light']:text-[${light.color}]`,
  ].join(" ");
}

/** Inline styles for a status badge (defaults to light palette; pass theme for dark). */
export function getRequestStatusStyle(
  status: string | null | undefined,
  theme: "light" | "dark" = "light",
): RequestStatusStyle {
  const key = getCanonicalRequestStatus(status);
  return theme === "dark" ? REQUEST_STATUS_BADGE_DARK[key] : REQUEST_STATUS_BADGE_LIGHT[key];
}

/** Tailwind classes: dark palette by default, light palette under [data-theme='light']. */
export function getRequestStatusBadgeClasses(status: string | null | undefined): string {
  return requestStatusBadgeClassesFor(getCanonicalRequestStatus(status));
}

/** Badge classes aligned with Lighthouse status colors (theme-aware). */
export const REQUEST_STATUS_BADGE_CLASSES: Record<RequestStatus, string> = {
  [REQUEST_STATUS_OPEN]: requestStatusBadgeClassesFor(REQUEST_STATUS_OPEN),
  [REQUEST_STATUS_COMPLETED_SUCCESS]: requestStatusBadgeClassesFor(REQUEST_STATUS_COMPLETED_SUCCESS),
  [REQUEST_STATUS_COMPLETED_FAILURE]: requestStatusBadgeClassesFor(REQUEST_STATUS_COMPLETED_FAILURE),
  [REQUEST_STATUS_IMPOSSIBLE]: requestStatusBadgeClassesFor(REQUEST_STATUS_IMPOSSIBLE),
};

/** @deprecated Use REQUEST_STATUS_BADGE_CLASSES — kept for existing imports. */
export const REQUEST_STATUS_CONTACT_BADGE: Record<RequestStatus, string> = REQUEST_STATUS_BADGE_CLASSES;

export const REQUEST_STATUS_KANBAN_META: Record<
  RequestStatus,
  { color: string; dotClass: string }
> = {
  [REQUEST_STATUS_OPEN]: {
    color: "border-[#92400E]",
    dotClass: "text-[#92400E] fill-[#92400E] [data-theme='light']:text-[#92400E]",
  },
  [REQUEST_STATUS_COMPLETED_SUCCESS]: {
    color: "border-[#065F46]",
    dotClass: "text-[#065F46] fill-[#065F46]",
  },
  [REQUEST_STATUS_COMPLETED_FAILURE]: {
    color: "border-[#991B1B]",
    dotClass: "text-[#991B1B] fill-[#991B1B]",
  },
  [REQUEST_STATUS_IMPOSSIBLE]: {
    color: "border-[#4B5563]",
    dotClass: "text-[#9CA3AF] fill-[#9CA3AF] [data-theme='light']:text-[#1F2937] [data-theme='light']:fill-[#1F2937]",
  },
};
