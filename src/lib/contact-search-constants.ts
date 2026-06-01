/** Age brackets for advanced contact search (matches /contacts list). */
export const CONTACT_SEARCH_AGE_GROUPS: Record<string, { min: number; max: number; label: string }> = {
  "17-20": { min: 17, max: 20, label: "17–20" },
  "20-40": { min: 20, max: 40, label: "20–40" },
  "40-70": { min: 40, max: 70, label: "40–70" },
  "70+": { min: 70, max: 120, label: "70+" },
};

export const GENDER_OPTIONS = [
  { value: "", label: "Αδιάφορο" },
  { value: "Άντρας", label: "Άντρας" },
  { value: "Γυναίκα", label: "Γυναίκα" },
] as const;

export const PRESENCE_OPTIONS = [
  { value: "", label: "Αδιάφορο" },
  { value: "has", label: "Έχει" },
  { value: "not", label: "Δεν έχει" },
] as const;

export const EKL_AR_OPTIONS = [
  { value: "", label: "Αδιάφορο" },
  { value: "has", label: "Έχει" },
  { value: "not", label: "Δεν έχει" },
] as const;

export const HAS_REQUEST_OPTIONS = [
  { value: "", label: "Αδιάφορο" },
  { value: "has", label: "Έχει αίτημα" },
  { value: "not", label: "Δεν έχει" },
] as const;
