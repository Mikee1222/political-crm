/** Orthodox nameday (month 1–12, day) from given name / nickname variants. */
export type NamedayMonthDay = { month: number; day: number };

const RAW: Array<[string, NamedayMonthDay]> = [
  // January
  ["βασίλης", { month: 1, day: 1 }],
  ["βασίλη", { month: 1, day: 1 }],
  ["βασίλειος", { month: 1, day: 1 }],
  ["βασιλική", { month: 1, day: 1 }],
  ["βάσω", { month: 1, day: 1 }],
  ["βάσια", { month: 1, day: 1 }],
  ["γιάννης", { month: 1, day: 7 }],
  ["γιαννης", { month: 1, day: 7 }],
  ["ιωάννης", { month: 1, day: 7 }],
  ["ιωαννης", { month: 1, day: 7 }],
  ["γιάννα", { month: 1, day: 7 }],
  ["ιωάννα", { month: 1, day: 7 }],
  ["νάνα", { month: 1, day: 7 }],
  ["τζένη", { month: 1, day: 7 }],
  ["αντώνης", { month: 1, day: 17 }],
  ["αντωνης", { month: 1, day: 17 }],
  ["αντώνιος", { month: 1, day: 17 }],
  ["αντωνια", { month: 1, day: 17 }],
  ["αντωνία", { month: 1, day: 17 }],
  ["τόνης", { month: 1, day: 17 }],
  ["τόνια", { month: 1, day: 17 }],
  ["τώνης", { month: 1, day: 17 }],
  ["αθανάσιος", { month: 1, day: 18 }],
  ["θανάσης", { month: 1, day: 18 }],
  ["θανασης", { month: 1, day: 18 }],
  ["νάσος", { month: 1, day: 18 }],
  ["τιμόθεος", { month: 1, day: 22 }],
  ["τιμόθης", { month: 1, day: 22 }],
  // February
  ["τριαντάφυλλος", { month: 2, day: 1 }],
  ["τριανταφυλλος", { month: 2, day: 1 }],
  ["τριαντάφυλλη", { month: 2, day: 1 }],
  ["τριαντάφυλλα", { month: 2, day: 1 }],
  ["φύλλης", { month: 2, day: 1 }],
  ["χαράλαμπος", { month: 2, day: 10 }],
  ["χαραλαμπος", { month: 2, day: 10 }],
  ["χάρης", { month: 2, day: 10 }],
  ["χαρης", { month: 2, day: 10 }],
  ["λάμπης", { month: 2, day: 10 }],
  ["λαμπης", { month: 2, day: 10 }],
  ["χαρούλα", { month: 2, day: 10 }],
  ["βαλεντίνος", { month: 2, day: 14 }],
  ["βαλεντινα", { month: 2, day: 14 }],
  ["βαλεντίνα", { month: 2, day: 14 }],
  // March
  ["ευδοκία", { month: 3, day: 1 }],
  ["ευδοκια", { month: 3, day: 1 }],
  ["κωνσταντίνος", { month: 3, day: 2 }],
  ["κωνσταντινος", { month: 3, day: 2 }],
  ["κώστας", { month: 3, day: 2 }],
  ["κωστας", { month: 3, day: 2 }],
  ["κωστής", { month: 3, day: 2 }],
  ["κωστης", { month: 3, day: 2 }],
  ["ντίνος", { month: 3, day: 2 }],
  ["ντινος", { month: 3, day: 2 }],
  // April / spring saints (γιορτές)
  ["γεώργιος", { month: 4, day: 23 }],
  ["γεωργιος", { month: 4, day: 23 }],
  ["γιώργης", { month: 4, day: 23 }],
  ["γιωργης", { month: 4, day: 23 }],
  ["γιώργος", { month: 4, day: 23 }],
  ["γιωργος", { month: 4, day: 23 }],
  ["γεωργία", { month: 4, day: 23 }],
  ["γεωργια", { month: 4, day: 23 }],
  ["γιωργία", { month: 4, day: 23 }],
  ["μάρκος", { month: 4, day: 25 }],
  ["μαρκος", { month: 4, day: 25 }],
  ["θεόδωρος", { month: 4, day: 12 }],
  ["θεοδωρος", { month: 4, day: 12 }],
  ["θοδωρής", { month: 4, day: 12 }],
  ["θοδωρης", { month: 4, day: 12 }],
  // May
  ["ειρήνη", { month: 5, day: 5 }],
  ["ειρηνη", { month: 5, day: 5 }],
  ["ρήνα", { month: 5, day: 5 }],
  ["ρηνα", { month: 5, day: 5 }],
  ["κωνσταντίνα", { month: 5, day: 21 }],
  ["κωνσταντινα", { month: 5, day: 21 }],
  ["ντίνα", { month: 5, day: 21 }],
  ["ντινα", { month: 5, day: 21 }],
  ["ελένη", { month: 5, day: 21 }],
  ["ελενη", { month: 5, day: 21 }],
  ["λένα", { month: 5, day: 21 }],
  ["λενα", { month: 5, day: 21 }],
  ["έλλη", { month: 5, day: 21 }],
  ["ελλη", { month: 5, day: 21 }],
  // June
  ["αλέξανδρος", { month: 6, day: 30 }],
  ["αλεξανδρος", { month: 6, day: 30 }],
  ["αλέξης", { month: 6, day: 30 }],
  ["αλεξης", { month: 6, day: 30 }],
  ["αλέκος", { month: 6, day: 30 }],
  ["αλεκος", { month: 6, day: 30 }],
  ["σάνδρα", { month: 6, day: 30 }],
  ["σανδρα", { month: 6, day: 30 }],
  ["αλεξάνδρα", { month: 6, day: 30 }],
  ["αλεξανδρα", { month: 6, day: 30 }],
  // July
  ["παρασκευή", { month: 7, day: 26 }],
  ["παρασκευη", { month: 7, day: 26 }],
  ["ευή", { month: 7, day: 26 }],
  ["ευη", { month: 7, day: 26 }],
  ["βούλα", { month: 7, day: 26 }],
  ["βουλα", { month: 7, day: 26 }],
  ["παρή", { month: 7, day: 26 }],
  ["παρη", { month: 7, day: 26 }],
  // August
  ["σταματία", { month: 8, day: 3 }],
  ["σταματια", { month: 8, day: 3 }],
  ["σταματίου", { month: 8, day: 3 }],
  ["ματίνα", { month: 8, day: 3 }],
  ["ματινα", { month: 8, day: 3 }],
  ["ματούλα", { month: 8, day: 3 }],
  ["παναγιώτης", { month: 8, day: 15 }],
  ["παναγιωτης", { month: 8, day: 15 }],
  ["παναγιώτα", { month: 8, day: 15 }],
  ["παναγιωτα", { month: 8, day: 15 }],
  ["παναγής", { month: 8, day: 15 }],
  ["παναγης", { month: 8, day: 15 }],
  ["πάνος", { month: 8, day: 15 }],
  ["πανος", { month: 8, day: 15 }],
  ["γιώτα", { month: 8, day: 15 }],
  ["γιωτα", { month: 8, day: 15 }],
  ["μαρία", { month: 8, day: 15 }],
  ["μαρια", { month: 8, day: 15 }],
  ["μαρίτσα", { month: 8, day: 15 }],
  ["μαριτσα", { month: 8, day: 15 }],
  ["μαρίκα", { month: 8, day: 15 }],
  ["μαρικα", { month: 8, day: 15 }],
  ["μαίρη", { month: 8, day: 15 }],
  ["μαιρη", { month: 8, day: 15 }],
  ["μαρούλα", { month: 8, day: 15 }],
  ["μαρουλα", { month: 8, day: 15 }],
  // September
  ["σταύρος", { month: 9, day: 14 }],
  ["σταυρος", { month: 9, day: 14 }],
  ["σταυρούλα", { month: 9, day: 14 }],
  ["σταυρουλα", { month: 9, day: 14 }],
  ["σοφία", { month: 9, day: 17 }],
  ["σοφια", { month: 9, day: 17 }],
  ["σοφούλα", { month: 9, day: 17 }],
  ["σοφουλα", { month: 9, day: 17 }],
  // October
  ["δημήτριος", { month: 10, day: 26 }],
  ["δημητριος", { month: 10, day: 26 }],
  ["δημήτρης", { month: 10, day: 26 }],
  ["δημητρης", { month: 10, day: 26 }],
  ["μήτσος", { month: 10, day: 26 }],
  ["μιτσος", { month: 10, day: 26 }],
  ["δημητρούλα", { month: 10, day: 26 }],
  ["δημητρουλα", { month: 10, day: 26 }],
  ["δήμητρα", { month: 10, day: 26 }],
  ["δημητρα", { month: 10, day: 26 }],
  ["θωμάς", { month: 10, day: 6 }],
  ["θωμας", { month: 10, day: 6 }],
  // November
  ["φίλιππος", { month: 11, day: 14 }],
  ["φιλιππος", { month: 11, day: 14 }],
  ["φίλης", { month: 11, day: 14 }],
  ["φιλης", { month: 11, day: 14 }],
  ["μιχάλης", { month: 11, day: 8 }],
  ["μιχαλης", { month: 11, day: 8 }],
  ["μιχαήλ", { month: 11, day: 8 }],
  ["μιχαηλ", { month: 11, day: 8 }],
  ["μιχαέλα", { month: 11, day: 8 }],
  ["μιχαελα", { month: 11, day: 8 }],
  ["μίχης", { month: 11, day: 8 }],
  ["μιχης", { month: 11, day: 8 }],
  ["κατερίνα", { month: 11, day: 25 }],
  ["κατερινα", { month: 11, day: 25 }],
  ["αικατερίνη", { month: 11, day: 25 }],
  ["αικατερινη", { month: 11, day: 25 }],
  ["κατερίνη", { month: 11, day: 25 }],
  ["κατερινη", { month: 11, day: 25 }],
  ["κάτια", { month: 11, day: 25 }],
  ["κατια", { month: 11, day: 25 }],
  ["ανδρέας", { month: 11, day: 30 }],
  ["ανδρεας", { month: 11, day: 30 }],
  ["ανδρούλα", { month: 11, day: 30 }],
  ["ανδρουλα", { month: 11, day: 30 }],
  // December
  ["νικόλαος", { month: 12, day: 6 }],
  ["νικολαος", { month: 12, day: 6 }],
  ["νίκος", { month: 12, day: 6 }],
  ["νικος", { month: 12, day: 6 }],
  ["νίκη", { month: 12, day: 6 }],
  ["νικη", { month: 12, day: 6 }],
  ["νικολέτα", { month: 12, day: 6 }],
  ["νικολετα", { month: 12, day: 6 }],
  ["κόλιας", { month: 12, day: 6 }],
  ["άννα", { month: 12, day: 9 }],
  ["αννα", { month: 12, day: 9 }],
  ["άννης", { month: 12, day: 9 }],
  ["αννης", { month: 12, day: 9 }],
  ["αναστάσιος", { month: 12, day: 22 }],
  ["αναστασιος", { month: 12, day: 22 }],
  ["τάσος", { month: 12, day: 22 }],
  ["τασος", { month: 12, day: 22 }],
  ["νάτασα", { month: 12, day: 22 }],
  ["νατασα", { month: 12, day: 22 }],
  ["αναστασία", { month: 12, day: 22 }],
  ["αναστασια", { month: 12, day: 22 }],
  ["σία", { month: 12, day: 22 }],
  ["σια", { month: 12, day: 22 }],
  ["σπύρος", { month: 12, day: 12 }],
  ["σπυρος", { month: 12, day: 12 }],
  ["σπυρίδων", { month: 12, day: 12 }],
  ["σπυριδων", { month: 12, day: 12 }],
  ["σπύρα", { month: 12, day: 12 }],
  ["χριστόφορος", { month: 12, day: 25 }],
  ["χριστοφορος", { month: 12, day: 25 }],
  ["χρήστος", { month: 12, day: 25 }],
  ["χρηστος", { month: 12, day: 25 }],
  ["χρυσούλα", { month: 12, day: 25 }],
  ["χρυσουλα", { month: 12, day: 25 }],
  ["χριστίνα", { month: 12, day: 25 }],
  ["χριστινα", { month: 12, day: 25 }],
  ["χριστίνη", { month: 12, day: 25 }],
  ["χριστινη", { month: 12, day: 25 }],
  ["στέλιος", { month: 12, day: 26 }],
  ["στελιος", { month: 12, day: 26 }],
  ["στέλλα", { month: 12, day: 26 }],
  ["στελλα", { month: 12, day: 26 }],
  // March 25
  ["ευαγγελία", { month: 3, day: 25 }],
  ["ευαγγελια", { month: 3, day: 25 }],
  ["ευαγγελος", { month: 3, day: 25 }],
  ["ευάγγελος", { month: 3, day: 25 }],
  ["βαγγελης", { month: 3, day: 25 }],
  ["βαγγέλης", { month: 3, day: 25 }],
  ["λίτσα", { month: 3, day: 25 }],
  ["λιτσα", { month: 3, day: 25 }],
  ["αγγελική", { month: 3, day: 25 }],
  ["αγγελικη", { month: 3, day: 25 }],
  ["αγγελίδης", { month: 3, day: 25 }],
];

const NORM = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

const NAMEDAY_MAP: Map<string, NamedayMonthDay> = (() => {
  const m = new Map<string, NamedayMonthDay>();
  for (const [k, v] of RAW) {
    m.set(NORM(k), v);
  }
  return m;
})();

/** For export: canonical lowercase keys (first variant kept). */
export const GREEK_NAME_TO_NAMEDAY: Record<string, NamedayMonthDay> = (() => {
  const o: Record<string, NamedayMonthDay> = {};
  for (const [k, v] of RAW) {
    o[k] = v;
  }
  return o;
})();

/**
 * Όνομα (μόνο μικρό) → ημερομηνία εορτής, ή null.
 */
export function getNameday(firstName: string): NamedayMonthDay | null {
  const token = (firstName.trim().split(/\s+/)[0] ?? "").trim();
  if (!token) return null;
  return NAMEDAY_MAP.get(NORM(token)) ?? null;
}

/**
 * `name_day` στη βάση (date επαναλαμβανόμενο έτος): 2000-MM-DD.
 */
export function nameDayDateStringFromFirstName(firstName: string): string | null {
  const d = getNameday(firstName);
  if (!d) return null;
  return `${2000}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}
