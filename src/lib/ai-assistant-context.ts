import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/roles";
import { hasMinRole } from "@/lib/roles";

function normGreek(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Search-style: βρες / ψάξε / δείξε + name */
function extractSearchName(message: string): string | null {
  const t = message.trim();
  const m = t.match(/(?:βρες|βρέ|ψάξε|ψαξ|δείξε|δειξ|αναζητ|κάνε αναζήτηση|κανε αναζητηση)\s+(.+)/i);
  if (m?.[1]) return m[1].replace(/^["'«]|[»"']$/g, "").trim() || null;
  return null;
}

export function detectContextTriggers(message: string) {
  const t = normGreek(message);
  return {
    namedays: /γιορτ|γιορταζ|γενεθλ/.test(t) && !/εβδομ|εβδ/.test(t),
    namedaysWeek: /εβδομ|εβδ|εβδομαδ/.test(t) && /γιορτ|γιορταζ/.test(t),
    callMix: /θετικ|αρνητ|αναμον|εκκρεμ|επαφ|call|κλησ.*κατασταση|αναποφ|αδιευκ/.test(t),
    positiveOnly: /θετικ/.test(t) && !/αρνητ/.test(t),
    negativeOnly: /αρνητ/.test(t),
    pendingOnly: /αναμον|αναποφ|αδιευκ|εκκρεμ|pending/.test(t) && !/θετικ|αρνητ/.test(t),
    requests: /αιτημ|αίτημ|εκκρεμ.*αιτ|ανοιχτ.αιτ/.test(t),
    tasks: /task|εργασ|tasks/.test(t),
    campaigns: /καμπαν|καμπάνι|ηχητ|κληση απο καμπανι/.test(t),
    byArea: /επαφ|περιοχ|δημ|χωρ|απο το|από το|απο την|από τη|αγρινι|πατρ|αθην/.test(t),
    noPhone: /χωρις τηλεφ|χωρ.ς τηλ|ατελ|ελλειπ.*τηλ|no phone|δεν.εχει τηλ/.test(t) || (/(τηλ|τηλεφ)/.test(t) && /χωρ|ελλει|κεν|ανυπαρκτ|δεν/.test(t)),
    generalStats: /στατ|συνολ|ποσο|επισκο|γενικ|αναλυτ|τι εχ|τι έχ|σήμερα[;\s]*$/i.test(message) || t.length < 3,
    searchName: /βρες|βρέ|ψαξ|ψάξ|δειξ|δείξ|αναζητ|κανε αναζητηση/.test(t),
    duplicates: /διπλοτ|διπλό|διπλά τυπ|duplicate|διπλ.φωνο/.test(t),
    forToday: /σήμερα|σημερα|αυτη.η.μερα|αυτή.η.ημερα|τι.εχω[;\s\?]/.test(t),
  };
}

async function todayNamedayContext(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();

  const [{ data: namedayRows }, { data: allContacts }, { data: bdays }] = await Promise.all([
    supabase.from("name_days").select("names").eq("month", month).eq("day", day).maybeSingle(),
    supabase.from("contacts").select("id, first_name, last_name, nickname, phone, birthday, call_status").limit(10000),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, birthday, call_status")
      .like("birthday", `%-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`),
  ]);

  const names = (namedayRows as { names?: string[] } | null)?.names ?? [];
  const namesSet = new Set((names as string[]).map((n) => normGreek(n)));

  const contacts = (allContacts ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    nickname: string | null;
    phone: string | null;
    call_status: string | null;
  }>;
  const celebrating = contacts.filter((c) => {
    const f = normGreek(c.first_name ?? "");
    const n = c.nickname ? normGreek(c.nickname) : "";
    return namesSet.has(f) || (n && namesSet.has(n));
  });

  return {
    date: { month, day },
    calendarNames: names,
    matchCount: celebrating.length,
    celebrating: celebrating.slice(0, 20).map((c) => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`,
      phone: c.phone,
      call_status: c.call_status,
    })),
    birthdaysToday: (bdays ?? []).length,
    birthdayPeople: (bdays ?? []).slice(0, 10).map((b: { id: string; first_name: string; last_name: string; phone: string | null }) => ({
      name: `${b.first_name} ${b.last_name}`,
      phone: b.phone,
    })),
  };
}

/** Namedays for the next 7 days with approximate name-day contact hits. */
async function weekNamedayContext(supabase: SupabaseClient): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const d0 = new Date();
  for (let o = 0; o < 7; o++) {
    const d = new Date(d0);
    d.setDate(d0.getDate() + o);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const { data: nd } = await supabase.from("name_days").select("names").eq("month", month).eq("day", day).maybeSingle();
    const names = ((nd as { names?: string[] } | null)?.names ?? []) as string[];
    let approxHits = 0;
    if (names.length) {
      const n1 = names[0]!.replace(/"/g, "");
      const { count } = await supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .or(`first_name.ilike.%${n1}%,nickname.ilike.%${n1}%`);
      approxHits = count ?? 0;
    }
    out.push({
      dayLabel: d.toLocaleDateString("el-GR", { weekday: "short", day: "numeric", month: "short" }),
      month,
      dayOfMonth: day,
      names,
      contactHitsApprox: approxHits,
    });
  }
  return out;
}

async function callStatusSnapshot(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("contacts").select("call_status");
  if (error) return { error: error.message };
  const rows = (data ?? []) as Array<{ call_status: string | null }>;
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const k = r.call_status || "Κενό";
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return { total: rows.length, byStatus: counts };
}

async function listContactsByStatus(
  supabase: SupabaseClient,
  status: string,
  cap: number,
): Promise<unknown[]> {
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, area, call_status, priority")
    .eq("call_status", status)
    .order("last_name", { ascending: true })
    .limit(cap);
  return data ?? [];
}

async function requestsContext(supabase: SupabaseClient) {
  const { count, data: open } = await supabase
    .from("requests")
    .select("id, title, status, created_at, category, contacts(first_name, last_name)", { count: "exact" })
    .in("status", ["Νέο", "Σε εξέλιξη"])
    .order("created_at", { ascending: false })
    .limit(15);
  return {
    openCount: count ?? open?.length ?? 0,
    open: (open ?? []).map((r: { title: string; status: string | null; created_at: string | null; category: string | null; contacts: unknown }) => {
      const ct = r.contacts as { first_name?: string; last_name?: string } | null;
      return {
        id: (r as { id?: string }).id,
        title: r.title,
        status: r.status,
        category: r.category,
        when: r.created_at,
        who: `${ct?.first_name ?? ""} ${ct?.last_name ?? ""}`.trim(),
      };
    }),
  };
}

async function allPendingTasksContext(supabase: SupabaseClient) {
  const { data, count } = await supabase
    .from("tasks")
    .select("id, title, due_date, contact_id, contacts(first_name,last_name)", { count: "exact" })
    .eq("completed", false)
    .order("due_date", { ascending: true })
    .limit(100);
  return {
    count: count ?? (data?.length ?? 0),
    tasks: (data ?? []).map(
      (r: {
        id: string;
        title: string;
        due_date: string | null;
        contacts: unknown;
      }) => {
        const c = r.contacts as { first_name?: string; last_name?: string } | null;
        return {
          task_id: r.id,
          title: r.title,
          due: r.due_date,
          contact: `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim(),
        };
      },
    ),
  };
}

async function campaignStats(supabase: SupabaseClient) {
  const { data: campaignRows, error } = await supabase
    .from("campaigns")
    .select("id, name, started_at, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) return { error: error.message };
  const out = await Promise.all(
    (campaignRows ?? []).map(async (campaign: { id: string; name: string; started_at: string | null }) => {
      const { data: callRows } = await supabase.from("calls").select("outcome").eq("campaign_id", campaign.id);
      const calls = (callRows ?? []) as Array<{ outcome: string | null }>;
      return {
        id: campaign.id,
        name: campaign.name,
        started: campaign.started_at,
        calls: calls.length,
        positive: calls.filter((c) => c.outcome === "Positive").length,
        negative: calls.filter((c) => c.outcome === "Negative").length,
        noAnswer: calls.filter((c) => c.outcome === "No Answer").length,
      };
    }),
  );
  return { campaigns: out };
}

async function searchContacts(supabase: SupabaseClient, q: string, take: number) {
  const t = q.trim();
  if (t.length < 2) return { query: t, matches: [] as unknown[] };
  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, area, municipality, call_status, priority, nickname")
    .or(
      `first_name.ilike.%${t}%,last_name.ilike.%${t}%,phone.ilike.%${t}%,nickname.ilike.%${t}%,municipality.ilike.%${t}%,area.ilike.%${t}%`,
    )
    .limit(take);
  const rows = (data ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    area: string | null;
    municipality: string | null;
    call_status: string | null;
    priority: string | null;
    nickname: string | null;
  }>;
  return {
    query: t,
    /** contact_id = UUID για ACTION_JSON (update_status, start_call, κλπ.) χωρίς νέα αναζήτηση */
    matches: rows.map((c) => ({
      contact_id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      phone: c.phone,
      area: c.area,
      municipality: c.municipality,
      call_status: c.call_status,
      priority: c.priority,
      nickname: c.nickname,
    })),
  };
}

/** Place: area or municipality substring in message, or second word after "Αγρίνιο" style */
async function placeContacts(supabase: SupabaseClient, message: string) {
  const t = normGreek(message);
  if (t.includes("αγριν")) {
    const { data: list, count } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, call_status, area, municipality", { count: "exact" })
      .or("area.ilike.%Αγρίν%,municipality.ilike.%Αγρίν%,municipality.ilike.%Αγρίνιο%")
      .limit(10);
    const raw = (list ?? []) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      call_status: string | null;
      area: string | null;
      municipality: string | null;
    }>;
    return {
      place: "Αγρίνιο/περίχωρα",
      count,
      contacts: raw.map((c) => ({
        contact_id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        call_status: c.call_status,
        area: c.area,
        municipality: c.municipality,
      })),
    };
  }
  const { data: areas } = await supabase.from("contacts").select("area, municipality").limit(2000);
  const distinct = new Set<string>();
  for (const row of areas ?? []) {
    const a = (row as { area: string | null; municipality: string | null }).area;
    const m = (row as { area: string | null; municipality: string | null }).municipality;
    if (a) distinct.add(a);
    if (m) distinct.add(m);
  }
  for (const place of distinct) {
    if (place.length < 2) continue;
    if (t.includes(normGreek(place)) || message.includes(place)) {
      const { data: list, count } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, call_status, area, municipality", { count: "exact" })
        .or(`area.ilike.%${place}%,municipality.ilike.%${place}%`)
        .limit(10);
      const raw = (list ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        phone: string | null;
        call_status: string | null;
        area: string | null;
        municipality: string | null;
      }>;
      return {
        place,
        count,
        contacts: raw.map((c) => ({
          contact_id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone,
          call_status: c.call_status,
          area: c.area,
          municipality: c.municipality,
        })),
      };
    }
  }
  return null;
}

async function contactsNoPhone(supabase: SupabaseClient) {
  const { count, error } = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .or("phone.is.null,phone.eq.");
  if (error) {
    const { data: rows } = await supabase.from("contacts").select("id, first_name, last_name, area, phone");
    const missing = (rows ?? []).filter(
      (c: { phone: string | null }) => c.phone == null || String(c.phone).trim() === "",
    );
    return { totalWithoutPhone: missing.length, sample: missing.slice(0, 10) };
  }
  const { data: sample } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, area, phone, call_status")
    .or("phone.is.null,phone.eq.")
    .limit(10);
  return { totalWithoutPhone: count ?? 0, sample: sample ?? [] };
}

/** Approximate: phones that appear more than once */
async function quickDuplicateCheck(supabase: SupabaseClient) {
  const { data: rows } = await supabase.from("contacts").select("id, first_name, last_name, phone").not("phone", "is", null);
  const byP = new Map<string, { id: string; first_name: string; last_name: string; phone: string }[]>();
  for (const r of rows ?? []) {
    const p = String((r as { phone: string | null }).phone)
      .replace(/\s/g, "")
      .toLowerCase();
    if (p.length < 5) continue;
    const arr = byP.get(p) ?? [];
    arr.push(r as { id: string; first_name: string; last_name: string; phone: string });
    byP.set(p, arr);
  }
  const dups = [...byP.entries()].filter(([, arr]) => arr.length > 1);
  return {
    duplicatePhoneGroups: dups.length,
    sampleGroups: dups.slice(0, 5).map(([phone, arr]) => ({
      phone: phone.slice(0, 4) + "***",
      count: arr.length,
      people: arr.map((c) => `${c.first_name} ${c.last_name} (${c.id})`),
    })),
  };
}

/** Full contact row for “person” queries */
async function searchPersonProfile(supabase: SupabaseClient, message: string) {
  const tokens = message
    .replace(/[.,;!?«»"']/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5);
  if (tokens.length < 1) return null;
  const q = tokens.length >= 2 ? `${tokens[0]} ${tokens[1]}` : tokens[0]!;
  const t0 = tokens[0]!;
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, phone, email, area, municipality, call_status, priority, political_stance, source, notes, age, gender, occupation, tags, name_day, birthday, nickname, spouse_name",
    )
    .or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,first_name.ilike.%${t0}%,last_name.ilike.%${t0}%`,
    )
    .limit(3);
  if (error || !data?.length) return null;
  return (data as Record<string, unknown>[])[0];
}

async function dashboardLikeSummary(
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const [{ count: totalContacts }, { count: totalCallsToday }, { data: callOutcomes }, { count: pendingCalls }] = await Promise.all([
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("calls").select("*", { count: "exact", head: true }).gte("called_at", todayIso),
    supabase.from("calls").select("outcome"),
    supabase.from("contacts").select("*", { count: "exact", head: true }).eq("call_status", "Pending"),
  ]);
  const outcomes = (callOutcomes ?? []) as Array<{ outcome: string | null }>;
  const pos = outcomes.filter((c) => c.outcome === "Positive").length;
  const rate = outcomes.length > 0 ? (pos / outcomes.length) * 100 : 0;
  return {
    totalContacts: totalContacts ?? 0,
    callsToday: totalCallsToday ?? 0,
    totalCallsAllTime: outcomes.length,
    positiveRatePercent: Math.round(rate * 10) / 10,
    pendingCallStatus: pendingCalls ?? 0,
  };
}

/**
 * Fetches always-on + keyword-based CRM context for the AI.
 */
export async function buildDatabaseContext(
  supabase: SupabaseClient,
  message: string,
  role: Role,
): Promise<{ contextLabel: string; data: Record<string, unknown> }> {
  const t = detectContextTriggers(message);
  const isMgr = hasMinRole(role, "manager");
  const parts: string[] = [];
  const data: Record<string, unknown> = { role, fetchedAt: new Date().toISOString() };

  const [summary, statusSnap, reqOpen, taskPending, nameToday] = await Promise.all([
    dashboardLikeSummary(supabase),
    callStatusSnapshot(supabase),
    (async () => {
      const { count } = await supabase
        .from("requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["Νέο", "Σε εξέλιξη"]);
      return count ?? 0;
    })(),
    (async () => {
      const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true }).eq("completed", false);
      return count ?? 0;
    })(),
    todayNamedayContext(supabase),
  ]);

  const byCounts: Record<string, number> =
    statusSnap && typeof statusSnap === "object" && "byStatus" in statusSnap
      ? (statusSnap as { byStatus: Record<string, number> }).byStatus
      : {};
  data.baseline = {
    totalContacts: summary.totalContacts,
    callStatus: statusSnap,
    openRequestsCount: reqOpen,
    pendingTasksCount: taskPending,
    todaysNameDays: nameToday,
  };
  parts.push("βασική σύνοψη CRM");

  if (t.forToday || t.generalStats) {
    data.todayOverview = { dashboard: summary, todaysNameDays: nameToday };
    parts.push("επισκόπηση ημέρας");
  }

  if (t.namedaysWeek) {
    data.weekNameDays = await weekNamedayContext(supabase);
    parts.push("γιορτές εβδομάδας (εκτιμ.)");
  } else if (t.namedays) {
    data.nameDayFocus = nameToday;
    parts.push("γιορτές/γενέθλια (εστίαση)");
  }

  if (t.callMix) {
    if (t.positiveOnly) {
      const list = await listContactsByStatus(supabase, "Positive", 15);
      data.positiveContacts = { count: byCounts?.Positive, sample: list };
    } else if (t.negativeOnly) {
      const list = await listContactsByStatus(supabase, "Negative", 15);
      data.negativeContacts = { count: byCounts?.Negative, sample: list };
    } else if (t.pendingOnly) {
      const { count, data: p } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, phone, call_status", { count: "exact" })
        .eq("call_status", "Pending")
        .limit(10);
      data.undecidedOrPending = { count, sample: p ?? [] };
    } else {
      data.callStatus = statusSnap;
      const { data: pos } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, area, call_status")
        .eq("call_status", "Positive")
        .limit(5);
      data.positiveSample = pos ?? [];
    }
    parts.push("καταστάσεις κλήσεων/δείγματα");
  }

  if (t.requests) {
    data.requests = await requestsContext(supabase);
    parts.push("αιτήματα (ανοικτά)");
  }

  if (t.tasks) {
    data.openTasks = await allPendingTasksContext(supabase);
    parts.push("όλες οι pending εργασίες");
  }

  if (t.campaigns && isMgr) {
    data.campaigns = await campaignStats(supabase);
    parts.push("καμπάνιες + στατιστικά");
  }

  if (t.searchName) {
    const s = extractSearchName(message) ?? message.slice(0, 60);
    data.nameSearch = await searchContacts(supabase, s, 5);
    parts.push("αναζήτηση ονόματος (top5)");
  }

  if (t.byArea) {
    const p = await placeContacts(supabase, message);
    if (p) {
      data.placeContacts = p;
      parts.push("επαφές ανά τόπο");
    }
  }

  if (t.noPhone) {
    data.missingPhone = await contactsNoPhone(supabase);
    parts.push("επαφές χωρίς τηλέφωνο");
  }

  if (t.generalStats) {
    data.extendedStats = await dashboardLikeSummary(supabase);
  }

  if (t.duplicates) {
    data.duplicates = await quickDuplicateCheck(supabase);
    parts.push("γρήγορος έλεγχος διπλοτύπων τηλ.");
  }

  const person = await searchPersonProfile(supabase, message);
  if (person) {
    const pid = (person as { id?: string }).id;
    data.suspectedPersonRow = { ...person, contact_id: pid };
    parts.push("αναλυτ. προφίλ υποψ. επαφής (λέξης/κειμένου)");
  }

  return {
    contextLabel: parts.join(" · "),
    data,
  };
}
