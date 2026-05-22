/**
 * Greek Orthodox εορτολόγιο (fixed calendar) — merged recurring dataset, feast supplements,
 * nickname variant groups, and matching helpers.
 * Moving (Pascha-based) feasts are listed separately in MOVING_NAMEDAY_FEASTS.
 */
import namedayRecurring from "./nameday-recurring.json";

export type NamedayMonthDay = { month: number; day: number };

export type NamedayCalendarEntry = {
  month: number;
  day: number;
  /** All celebrating names (canonical + nicknames) for contact matching */
  names: string[];
  /** Saints / feast titles for display */
  saints: string[];
  moving?: boolean;
};

export type NamedaySeedRow = { month: number; day: number; names: string[] };

export type MovingNamedayFeast = {
  id: string;
  label: string;
  description: string;
  /** Days relative to Orthodox Easter Sunday (0 = Easter) */
  offsetFromEaster: number;
  names: string[];
};

/** Pascha-based feasts — not stored in fixed `name_days`; compute per year elsewhere. */
export const MOVING_NAMEDAY_FEASTS: MovingNamedayFeast[] = [
  {
    id: "clean_monday",
    label: "Καθαρά Δευτέρα",
    description: "Κινητή εορτή (48 ημέρες πριν το Πάσχα)",
    offsetFromEaster: -48,
    names: [],
  },
  {
    id: "palm_sunday",
    label: "Κυριακή των Βαΐων",
    description: "Κινητή εορτή (7 ημέρες πριν το Πάσχα)",
    offsetFromEaster: -7,
    names: ["Βάιος", "Βαΐα"],
  },
  {
    id: "easter",
    label: "Κυριακή του Πάσχα",
    description: "Κινητή εορτή",
    offsetFromEaster: 0,
    names: ["Λαμπρή", "Λαμπρινή", "Πασχάλης", "Πάσχος", "Πασχαλιά", "Πασχαλίνη"],
  },
  {
    id: "holy_spirit",
    label: "Αγίου Πνεύματος",
    description: "Κινητή εορτή (50 ημέρες μετά το Πάσχα)",
    offsetFromEaster: 50,
    names: [],
  },
  {
    id: "zoodochos_pege",
    label: "Ζωοδόχου Πηγής",
    description: "Κινητή εορτή (Παρασκευή μετά το Πάσχα)",
    offsetFromEaster: 5,
    names: ["Ζωή"],
  },
];

export function normalizeGreekName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ς$/, "σ")
    .trim();
}

/** When any name on a feast day appears, add the whole group's variants. */
export const NAMEDAY_VARIANT_GROUPS: readonly string[][] = [
  ["Κωνσταντίνος", "Κωνσταντίνα", "Κώστας", "Κωστής", "Κωστάκης", "Κωστάντω", "Κωστούλα", "Ντίνος", "Ντίνα", "Νέντα", "Νάντια", "Κώτσος"],
  ["Ελένη", "Ελενα", "Λένα", "Έλλη", "Ελλη", "Ελεωνόρα", "Μαριλένα", "Ελενιώ", "Ελενίτσα"],
  ["Γεώργιος", "Γεωργία", "Γιώργος", "Γιώργης", "Γιώργια", "Γεωργία"],
  ["Δημήτριος", "Δημήτρης", "Δήμητρα", "Δημητρούλα", "Μίμης", "Μίτση", "Μήτσος"],
  ["Νικόλαος", "Νίκος", "Νίκη", "Νικολέτα", "Κόλιας", "Νικολάς"],
  ["Ιωάννης", "Γιάννης", "Ιωάννα", "Γιάννα", "Γιαννούλα", "Βάνα", "Βάννα", "Νάνα", "Τζένη", "Πρόδρομος", "Προδρομία", "Μάκης"],
  ["Ευάγγελος", "Ευαγγελία", "Βαγγέλης", "Λίτσα", "Αγγελική", "Αγγελίνα", "Μαρία", "Μάριος", "Παναγιώτα"],
  ["Αναστάσιος", "Αναστασία", "Τάσος", "Τασία", "Νάτασα", "Σία", "Σίσσυ", "Στασούλα", "Στασάκης"],
  ["Βασίλειος", "Βασιλική", "Βασίλης", "Βασίλω", "Βάσω", "Βάσια"],
  ["Μιχαήλ", "Μιχαέλα", "Μιχάλης", "Μίχης", "Μικέλα"],
  ["Αθανάσιος", "Αθανασία", "Θανάσης", "Νάσος", "Σούλα"],
  ["Παναγιώτης", "Παναγιώτα", "Παναγής", "Πάνος", "Γιώτα", "Μαρία", "Μαρούλα", "Μαίρη"],
  ["Χαράλαμπος", "Χαρούλα", "Χάρης", "Λάμπης", "Μπάμπης"],
  ["Σπυρίδων", "Σπύρος", "Σπυράννα", "Σπυρούλα"],
  ["Αντώνιος", "Αντωνία", "Αντώνης", "Τόνης", "Τόνια", "Τώνης", "Νίκος"],
  ["Κυριάκος", "Κυριακή", "Κυριακούλα"],
  ["Ειρήνη", "Ρήνα", "Ιρένη"],
  ["Σταύρος", "Σταυρούλα", "Σταυρή", "Σταυρίτσα"],
  ["Αλέξανδρος", "Αλεξάνδρα", "Αλέξης", "Αλέκος", "Σάντρα"],
  ["Μαρία", "Μάριος", "Μαριάννα", "Μαριώ", "Μαρούλα", "Μαίρη", "Μαρίκα", "Μαρίτσα"],
  ["Χρήστος", "Χριστίνα", "Χριστίνα", "Χριστίνα", "Χρυσούλα", "Χριστόφορος"],
  ["Κατερίνα", "Αικατερίνη", "Κάτια", "Κατερίνη"],
  ["Ανδρέας", "Ανδρούλα", "Ανδριανή"],
  ["Σοφία", "Σοφούλα", "Σοφία"],
  ["Θεόδωρος", "Θεοδώρα", "Θοδωρής", "Θοδωρία"],
  ["Τριάνταφυλλος", "Τριάνταφυλλη", "Τριάνταφυλλα", "Φύλλης", "Ρόζα"],
  ["Φίλιππος", "Φιλίππα", "Φίλης"],
  ["Σταματία", "Σταμάτιος", "Ματίνα", "Ματούλα"],
  ["Χριστιάνα", "Χριστιανός", "Χρύσα"],
];

/** Saints + extra names for gaps in the bundled list and major feasts. Key: "month-day". */
const FEAST_SUPPLEMENTS: Record<string, { saints: string[]; names: string[] }> = {
  "1-1": { saints: ["Αγίου Βασιλείου"], names: ["Βασίλειος", "Βασιλική", "Βασίλης", "Βασίλω", "Βάσω"] },
  "1-4": { saints: ["Συμεών ο Θεοδόχος"], names: ["Συμεών", "Συμεώνα"] },
  "1-6": { saints: ["Θεοφανείων"], names: ["Φάνης", "Φανή", "Θεοφάνης", "Φανούλα", "Φανουρία", "Ιορδάνης"] },
  "1-7": { saints: ["Αγίου Ιωάννου Προδρόμου"], names: ["Ιωάννης", "Γιάννης", "Ιωάννα", "Πρόδρομος", "Προδρομία"] },
  "1-9": { saints: ["Αγίου Πολυκάρπου"], names: ["Πολύκαρπος"] },
  "1-10": { saints: ["Αγίου Γρηγορίου Νύσσης"], names: ["Γρηγόριος", "Γρηγορία"] },
  "1-15": { saints: ["Αγίων Κοσμά και Δαμιανού"], names: ["Κοσμάς", "Δαμιανός", "Κοσμάς", "Κοσμάς"] },
  "1-16": { saints: ["Αγίας Μαρίνας"], names: ["Μαρίνα"] },
  "1-17": { saints: ["Αγίου Αντωνίου"], names: ["Αντώνιος", "Αντωνία", "Αντώνης", "Τόνης"] },
  "1-18": { saints: ["Αγίου Αθανασίου"], names: ["Αθανάσιος", "Αθανασία", "Θανάσης", "Νάσος"] },
  "1-27": { saints: ["Αγίου Ανησίου"], names: ["Ανίσιος"] },
  "2-10": { saints: ["Αγίου Χαραλάμπους"], names: ["Χαράλαμπος", "Χαρούλα", "Χάρης", "Λάμπης"] },
  "2-20": { saints: ["Αγίου Πετρουλίου"], names: ["Πέτρος", "Πετρούλα"] },
  "2-21": { saints: ["Αγίας Ευφροσύνης"], names: ["Ευφροσύνη", "Φροσώ"] },
  "3-10": { saints: ["Αγίων Σαράντα Μαρτύρων"], names: ["Σαράντος"] },
  "3-21": { saints: ["Οσίου Ιακώβου"], names: ["Ιάκωβος", "Ιακωβίνα"] },
  "3-23": { saints: ["Μνημοσύνου Νικηφόρου"], names: ["Νικηφόρος"] },
  "3-24": { saints: ["Προεόρτια Ευαγγελισμού"], names: ["Ευαγγελία"] },
  "3-25": {
    saints: ["Ευαγγελισμός της Θεοτόκου"],
    names: ["Ευαγγελία", "Ευάγγελος", "Βαγγέλης", "Λίτσα", "Αγγελική", "Μαρία", "Μάριος", "Παναγιώτα"],
  },
  "3-28": { saints: ["Αγίου Ιωάννου της Κλίμακος"], names: ["Ιωάννης", "Γιάννης"] },
  "3-29": { saints: ["Αγίου Μαρκέλλου"], names: ["Μάρκελλος"] },
  "3-30": { saints: ["Αγίου Ιωάννου Κλιμάκος"], names: ["Ιωάννης", "Γιάννης"] },
  "4-1": { saints: ["Αγίας Μαρίας Αιγυπτίας"], names: ["Μαρία"] },
  "4-4": { saints: ["Αγίου Ζωοδόχου Πηγής"], names: ["Ζωή"] },
  "4-5": { saints: ["Αγίας Κλαυδίας"], names: ["Κλαυδία"] },
  "4-7": { saints: ["Αγίου Ιωάννου του Ελεήμονος"], names: ["Ιωάννης", "Γιάννης"] },
  "4-8": { saints: ["Αγίων Αποστόλων"], names: ["Απόστολος"] },
  "4-12": { saints: ["Αγίου Θεοδώρου"], names: ["Θεόδωρος", "Θοδωρής", "Θεοδώρα"] },
  "4-17": { saints: ["Αγίας Φωτούλας"], names: ["Φωτεινή", "Φωτώ"] },
  "4-19": { saints: ["Αγίου Ιεράρχου"], names: ["Ιεράρχης"] },
  "4-23": {
    saints: ["Αγίου Γεωργίου του Τροπαιοφόρου"],
    names: ["Γεώργιος", "Γεωργία", "Γιώργος", "Γιώργης", "Γιώργια", "Ζωή"],
  },
  "4-25": { saints: ["Αγίου Μάρκου"], names: ["Μάρκος", "Μαρκία"] },
  "4-27": { saints: ["Αγίου Ραφαήλ"], names: ["Ραφαήλ", "Ραφαέλα"] },
  "5-5": { saints: ["Αγίας Ειρήνης"], names: ["Ειρήνη", "Ρήνα"] },
  "5-7": { saints: ["Αγίου Ιωάννου του Θεολόγου"], names: ["Ιωάννης", "Γιάννης"] },
  "5-16": { saints: ["Αγίας Θεοδώρας"], names: ["Θεοδώρα"] },
  "5-21": {
    saints: ["Αγίων Κωνσταντίνου και Ελένης"],
    names: [
      "Κωνσταντίνος",
      "Κωνσταντίνα",
      "Κώστας",
      "Κωστής",
      "Ελένη",
      "Λένα",
      "Έλλη",
      "Ντίνα",
      "Νάντια",
      "Αναστασία",
      "Αναστάσιος",
      "Τάσος",
      "Νάτασα",
    ],
  },
  "5-23": { saints: ["Αγίου Ιακώβου"], names: ["Ιάκωβος", "Ιακωβίνα"] },
  "5-25": { saints: ["Τρίτης Ευρέσεως"], names: ["Εύρεση"] },
  "6-10": { saints: ["Αγίου Νικολάου Πλανά"], names: ["Νικόλαος", "Νίκος"] },
  "6-29": { saints: ["Αγίων Αποστόλων Πέτρου και Παύλου"], names: ["Πέτρος", "Παύλος", "Παυλίνα"] },
  "6-30": { saints: ["Αγίων Αποστόλων"], names: ["Απόστολος", "Αλέξανδρος", "Αλεξάνδρα"] },
  "7-2": { saints: ["Αγίου Ιούδα"], names: ["Ιούδας", "Ιουδίθ"] },
  "7-4": { saints: ["Αγίας Μαρίνας"], names: ["Μαρίνα"] },
  "7-16": { saints: ["Αγίας Μαρίνας"], names: ["Μαρίνα"] },
  "7-17": { saints: ["Αγίας Μαρίνας"], names: ["Μαρίνα"] },
  "7-21": { saints: ["Αγίας Πραξιδίκης"], names: ["Πραξιδίκη"] },
  "7-23": { saints: ["Αγίας Παρασκευής"], names: ["Παρασκευή", "Εύη", "Βούλα"] },
  "7-26": { saints: ["Αγίας Παρασκευής"], names: ["Παρασκευή", "Εύη", "Βούλα", "Παρή"] },
  "8-3": { saints: ["Αγίας Σταματίας"], names: ["Σταματία", "Ματίνα", "Ματούλα"] },
  "8-9": { saints: ["Αγίου Ματθαίου"], names: ["Ματθαίος", "Ματίνα"] },
  "8-13": { saints: ["Αγίου Μαξίμου"], names: ["Μάξιμος", "Μαξιμίνα"] },
  "8-14": { saints: ["Προεόρτια Κοιμήσεως"], names: ["Μαρία", "Παναγιώτα"] },
  "8-15": {
    saints: ["Κοίμηση της Θεοτόκου"],
    names: ["Παναγιώτης", "Παναγιώτα", "Μαρία", "Μαρούλα", "Γιώτα", "Πάνος", "Παναγής"],
  },
  "8-19": { saints: ["Αγίου Ανδρέα"], names: ["Ανδρέας", "Ανδρούλα"] },
  "8-21": { saints: ["Αγίου Σαμψώνος"], names: ["Σαμψών"] },
  "8-31": { saints: ["Κατάθεση Τιμίας Ζώνης"], names: ["Ζώνη"] },
  "9-12": { saints: ["Αγίου Μαυρίκιου"], names: ["Μαυρίκιος"] },
  "9-14": { saints: ["Ύψωση του Τιμίου Σταυρού"], names: ["Σταύρος", "Σταυρούλα"] },
  "9-17": { saints: ["Αγίας Σοφίας"], names: ["Σοφία", "Σοφούλα"] },
  "9-26": { saints: ["Αγίου Ιωάννου"], names: ["Ιωάννης", "Γιάννης"] },
  "10-6": { saints: ["Αγίου Θωμά"], names: ["Θωμάς", "Θωμαΐς"] },
  "10-11": { saints: ["Αγίου Φιλίππου"], names: ["Φίλιππος", "Φιλίππα"] },
  "10-16": { saints: ["Αγίου Λογγίνου"], names: ["Λογγίνος"] },
  "10-26": {
    saints: ["Αγίου Δημητρίου"],
    names: ["Δημήτριος", "Δημήτρης", "Δήμητρα", "Δημητρούλα", "Μίμης", "Μίτση"],
  },
  "11-3": { saints: ["Αγίων Αναργύρων"], names: ["Κοσμάς", "Δαμιανός"] },
  "11-8": { saints: ["Αγίων Αρχαγγέλων"], names: ["Μιχαήλ", "Γαβριήλ", "Μιχαέλα", "Μιχάλης"] },
  "11-12": { saints: ["Αγίου Ιωάννου"], names: ["Ιωάννης", "Γιάννης"] },
  "11-14": { saints: ["Αγίου Φιλίππου"], names: ["Φίλιππος", "Φίλιππα"] },
  "11-15": { saints: ["Αγίου Γουρίου"], names: ["Γουρίος"] },
  "11-19": { saints: ["Αγίου Ιωάννου"], names: ["Ιωάννης", "Γιάννης"] },
  "11-24": { saints: ["Αγίου Κλήμεντος"], names: ["Κλήμης", "Κλημεντία"] },
  "11-25": { saints: ["Αγίας Αικατερίνης"], names: ["Αικατερίνη", "Κατερίνα", "Κάτια"] },
  "11-27": { saints: ["Αγίου Στεφάνου"], names: ["Στέφανος", "Στεφανία", "Στέλλα"] },
  "11-30": { saints: ["Αγίου Ανδρέα"], names: ["Ανδρέας", "Ανδρούλα"] },
  "12-6": { saints: ["Αγίου Νικολάου"], names: ["Νικόλαος", "Νίκος", "Νικολέτα", "Κόλιας"] },
  "12-9": { saints: ["Αγίας Άννης"], names: ["Άννα", "Άννης", "Αννίτα"] },
  "12-10": { saints: ["Αγίου Μηνά"], names: ["Μηνάς", "Μηνάς"] },
  "12-11": { saints: ["Αγίου Δανιήλ"], names: ["Δανιήλ", "Δανιέλα"] },
  "12-12": { saints: ["Αγίου Σπυρίδωνος"], names: ["Σπυρίδων", "Σπύρος", "Σπυρούλα"] },
  "12-22": {
    saints: ["Αγίας Αναστασίας"],
    names: ["Αναστασία", "Αναστάσιος", "Τάσος", "Νάτασα", "Σία", "Τασία"],
  },
  "12-25": {
    saints: ["Χριστούγεννα"],
    names: ["Χρήστος", "Χριστίνα", "Χρυσούλα", "Χριστόφορος", "Μάνα"],
  },
  "12-26": { saints: ["Σύναξη Θεοτόκου"], names: ["Στέλιος", "Στέλλα", "Μανώλης", "Εμμανουήλ"] },
};

function dayKey(month: number, day: number) {
  return `${month}-${day}`;
}

function expandVariantNames(names: Set<string>) {
  for (const group of NAMEDAY_VARIANT_GROUPS) {
    const normalizedGroup = group.map((n) => normalizeGreekName(n));
    const hit = [...names].some((n) => normalizedGroup.includes(normalizeGreekName(n)));
    if (hit) {
      for (const n of group) names.add(n);
    }
  }
}

function daysInMonth(month: number) {
  return new Date(2024, month, 0).getDate();
}

let calendarCache: NamedayCalendarEntry[] | null = null;

/** Full fixed-calendar εορτολόγιο (all days of year; empty name list only if truly no feast). */
export function getNamedayCalendar(): NamedayCalendarEntry[] {
  if (calendarCache) return calendarCache;

  const byDay = new Map<string, { names: Set<string>; saints: Set<string> }>();

  const ensure = (month: number, day: number) => {
    const k = dayKey(month, day);
    if (!byDay.has(k)) byDay.set(k, { names: new Set(), saints: new Set() });
    return byDay.get(k)!;
  };

  const data = (namedayRecurring as { data: { date: string; names: string[] }[] }).data;
  for (const row of data) {
    const [d, m] = row.date.split("/").map((x) => parseInt(x, 10));
    if (!m || !d) continue;
    const bucket = ensure(m, d);
    for (const n of row.names) {
      const t = String(n).trim();
      if (t) bucket.names.add(t);
    }
  }

  for (const [k, sup] of Object.entries(FEAST_SUPPLEMENTS)) {
    const [ms, ds] = k.split("-");
    const month = parseInt(ms ?? "0", 10);
    const day = parseInt(ds ?? "0", 10);
    if (month < 1 || month > 12 || day < 1) continue;
    const bucket = ensure(month, day);
    for (const s of sup.saints) bucket.saints.add(s);
    for (const n of sup.names) bucket.names.add(n);
  }

  for (const bucket of byDay.values()) {
    expandVariantNames(bucket.names);
  }

  const out: NamedayCalendarEntry[] = [];
  for (let month = 1; month <= 12; month++) {
    for (let day = 1; day <= daysInMonth(month); day++) {
      const k = dayKey(month, day);
      const bucket = byDay.get(k);
      const saints = [...(bucket?.saints ?? [])].sort((a, b) => a.localeCompare(b, "el"));
      const names = [...(bucket?.names ?? new Set<string>())].sort((a, b) => a.localeCompare(b, "el"));
      out.push({ month, day, names, saints });
    }
  }

  calendarCache = out;
  return out;
}

/** Rows for Supabase `name_days` sync (admin). */
export function getNamedaySeedRows(): NamedaySeedRow[] {
  return getNamedayCalendar()
    .filter((r) => r.names.length > 0)
    .map((r) => ({ month: r.month, day: r.day, names: r.names }));
}

export function getNamedaySeedStats() {
  const rows = getNamedaySeedRows();
  const nameCount = rows.reduce((acc, r) => acc + r.names.length, 0);
  const allDays = getNamedayCalendar().length;
  return { dayCount: rows.length, calendarDays: allDays, nameCount };
}

export function getNamesForDate(month: number, day: number): string[] {
  const row = getNamedayCalendar().find((r) => r.month === month && r.day === day);
  return row?.names ?? [];
}

export function getSaintsForDate(month: number, day: number): string[] {
  const row = getNamedayCalendar().find((r) => r.month === month && r.day === day);
  return row?.saints ?? [];
}

/** Contact first name / nickname matches any celebrating name (accent- and case-insensitive). */
export function contactCelebratesNameday(
  firstName: string | null | undefined,
  nickname: string | null | undefined,
  nameDayNames: string[],
): boolean {
  const contactFirst = normalizeGreekName(firstName ?? "");
  const contactNick = normalizeGreekName(nickname ?? "");
  if (!contactFirst && !contactNick) return false;
  return nameDayNames.some((n) => {
    const norm = normalizeGreekName(n);
    return norm.length > 0 && (norm === contactFirst || (contactNick.length > 0 && norm === contactNick));
  });
}

let nameLookupCache: Map<string, NamedayMonthDay> | null = null;

function buildNameLookup(): Map<string, NamedayMonthDay> {
  if (nameLookupCache) return nameLookupCache;
  const m = new Map<string, NamedayMonthDay>();
  const calendar = getNamedayCalendar();
  const isFeastDay = (month: number, day: number) => Boolean(FEAST_SUPPLEMENTS[dayKey(month, day)]);

  // Pass 1: recurring / general calendar
  for (const row of calendar) {
    if (isFeastDay(row.month, row.day)) continue;
    for (const name of row.names) {
      const key = normalizeGreekName(name);
      if (!key || m.has(key)) continue;
      m.set(key, { month: row.month, day: row.day });
    }
  }
  // Pass 2: major feast supplements override ambiguous recurring dates
  for (const row of calendar) {
    if (!isFeastDay(row.month, row.day)) continue;
    for (const name of row.names) {
      const key = normalizeGreekName(name);
      if (!key) continue;
      m.set(key, { month: row.month, day: row.day });
    }
  }
  nameLookupCache = m;
  return m;
}

/** First token of given name → fixed nameday month/day, or null. */
export function getNamedayMonthDayForFirstName(firstName: string): NamedayMonthDay | null {
  const token = (firstName.trim().split(/\s+/)[0] ?? "").trim();
  if (!token) return null;
  return buildNameLookup().get(normalizeGreekName(token)) ?? null;
}

/** `name_day` column (recurring year): `2000-MM-DD`. */
export function nameDayDateStringFromFirstName(firstName: string): string | null {
  const d = getNamedayMonthDayForFirstName(firstName);
  if (!d) return null;
  return `${2000}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** For export: lowercase keys from bundled variant list. */
export const GREEK_NAME_TO_NAMEDAY: Record<string, NamedayMonthDay> = (() => {
  const o: Record<string, NamedayMonthDay> = {};
  for (const [key, val] of buildNameLookup()) {
    o[key] = val;
  }
  return o;
})();
