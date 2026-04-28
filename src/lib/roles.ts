export type Role = "caller" | "manager" | "admin";

export const ROLE_ORDER: Record<Role, number> = {
  caller: 0,
  manager: 1,
  admin: 2,
};

export const ROLE_BADGE: Record<Role, string> = {
  caller: "Καλών",
  manager: "Υπεύθυνος",
  admin: "Διαχειριστής",
};

export function hasMinRole(userRole: string | null | undefined, min: Role): boolean {
  const r = userRole ?? "caller";
  if (!(r in ROLE_ORDER)) return false;
  return ROLE_ORDER[r as Role] >= ROLE_ORDER[min];
}
