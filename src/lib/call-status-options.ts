/** DB `call_status` values + Greek labels (contacts / calls). */
export const CONTACT_CALL_STATUS_OPTIONS = [
  { value: "Pending", label: "Νέα" },
  { value: "Positive", label: "Θετική" },
  { value: "Negative", label: "Αρνητική" },
  { value: "No Answer", label: "Δεν απαντά" },
] as const;

export type ContactCallStatusValue = (typeof CONTACT_CALL_STATUS_OPTIONS)[number]["value"];
