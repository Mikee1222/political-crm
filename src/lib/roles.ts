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

export function hasMinRole(userRole: Role | null | undefined, min: Role): boolean {
  const r = (userRole ?? "caller") as Role;
  return ROLE_ORDER[r] >= ROLE_ORDER[min];
}
