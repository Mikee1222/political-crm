export type ContactGroupRow = {
  id: string;
  name: string;
  color: string;
  year: number | null;
  description: string | null;
  created_at: string;
};

/** Keep first occurrence per id (API/DB may return duplicates). */
export function dedupeContactGroupsById(groups: ContactGroupRow[]): ContactGroupRow[] {
  return [...new Map(groups.map((g) => [g.id, g])).values()];
}
