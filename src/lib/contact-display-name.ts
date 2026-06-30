/** ΕΠΩΝΥΜΟ ΟΝΟΜΑ [του ΠΑΤΡΩΝΥΜΟ] */
export function formatGreekContactName(
  lastName: string | null | undefined,
  firstName: string | null | undefined,
  fatherName?: string | null,
): string {
  const l = (lastName ?? "").trim();
  const f = (firstName ?? "").trim();
  const p = (fatherName ?? "").trim();
  const core = [l, f].filter(Boolean).join(" ");
  if (!core) return "Επαφή";
  if (p) return `${core} [του ${p}]`;
  return core;
}
