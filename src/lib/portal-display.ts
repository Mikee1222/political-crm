/** Display name for portal UI — avoids "—" when first_name is empty in DB. */
export function portalDisplayFirstName(portal: {
  first_name?: string | null;
  last_name?: string | null;
} | null | undefined): string {
  if (!portal) {
    return "Πολίτη";
  }
  const f = (portal.first_name ?? "").trim();
  if (f) {
    return f;
  }
  const l = (portal.last_name ?? "").trim();
  if (l) {
    return l;
  }
  return "Πολίτη";
}
