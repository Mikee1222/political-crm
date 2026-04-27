/** Σύγκριση ημερολογιακής ημέρας Europe/Athens (για στατιστικά «σήμερα»). */
export function formatDateInEuropeAthens(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isSameEuropeAthensCalendarDay(isoLike: string | null | undefined): boolean {
  if (!isoLike) return false;
  const t = new Date(isoLike).getTime();
  if (Number.isNaN(t)) return false;
  const callDay = formatDateInEuropeAthens(new Date(t));
  const today = formatDateInEuropeAthens(new Date());
  return callDay === today;
}
