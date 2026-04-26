import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { buildContactsQuery, contactMatchesLocalSearch } from "@/lib/contacts-query";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { callStatusLabel } from "@/lib/luxury-styles";

function escapeCsvCell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function priorityGr(p: string | null | undefined): string {
  if (p === "High") return "Υψηλή";
  if (p === "Low") return "Χαμηλή";
  if (p === "Medium") return "Μεσαία";
  return p ?? "";
}

const SELECT_EXPORT =
  "id, first_name, last_name, phone, email, area, municipality, electoral_district, call_status, priority, political_stance, notes, nickname";

export async function GET(request: NextRequest) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "caller")) {
    return forbidden();
  }

  const sp = request.nextUrl.searchParams;
  const idsParam = sp.get("ids");
  const filtered = sp.get("filters") === "1" || sp.get("filtered") === "1";

  const isManager = hasMinRole(profile?.role, "manager");

  // Branches use different .select() shapes (export vs buildContactsQuery) — single builder type is impractical.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- postgrest builder union from mixed branches
  let query: any = supabase.from("contacts").select(SELECT_EXPORT);

  if (idsParam?.trim()) {
    const ids = idsParam
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (ids.length) query = query.in("id", ids);
  } else if (filtered && sp.get("nameday_today") === "1") {
    const now = new Date();
    const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
    if (ids.length === 0) {
      query = supabase.from("contacts").select(SELECT_EXPORT).limit(0);
    } else {
      let qn = supabase.from("contacts").select(SELECT_EXPORT).in("id", ids);
      const callStatus = sp.get("call_status");
      const area = sp.get("area");
      const municipality = sp.get("municipality");
      const priority = sp.get("priority");
      const tag = sp.get("tag");
      if (callStatus) qn = qn.eq("call_status", callStatus);
      if (area) qn = qn.eq("area", area);
      if (municipality) qn = qn.ilike("municipality", `%${municipality}%`);
      if (priority) qn = qn.eq("priority", priority);
      if (tag) qn = qn.contains("tags", [tag]);
      query = qn;
    }
  } else if (filtered) {
    query = buildContactsQuery(supabase, {
      search: sp.get("search") ?? undefined,
      call_status: sp.get("call_status") ?? undefined,
      area: sp.get("area") ?? undefined,
      municipality: sp.get("municipality") ?? undefined,
      priority: sp.get("priority") ?? undefined,
      tag: sp.get("tag") ?? undefined,
    });
  } else {
    if (!isManager) {
      return NextResponse.json({ error: "Η εξαγωγή όλων απαιτεί δικαιώματα υπευθύνου" }, { status: 403 });
    }
  }

  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  let rawRows = (data ?? []) as Array<{
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    area: string | null;
    municipality: string | null;
    electoral_district: string | null;
    call_status: string | null;
    priority: string | null;
    political_stance: string | null;
    notes: string | null;
    nickname: string | null;
  }>;

  if (filtered && sp.get("search")?.trim()) {
    const sq = sp.get("search");
    rawRows = rawRows.filter((c) => contactMatchesLocalSearch(c, sq));
  }

  const rows = rawRows;

  const header = [
    "Μικρό Όνομα",
    "Επίθετο",
    "Τηλέφωνο",
    "Email",
    "Περιοχή",
    "Δήμος",
    "Εκλογικό Διαμέρισμα",
    "Κατάσταση",
    "Προτεραιότητα",
    "Πολιτική Τοποθέτηση",
    "Σημειώσεις",
  ];
  const lines = [
    header.map(escapeCsvCell).join(","),
    ...rows.map((r) =>
      [
        r.first_name,
        r.last_name,
        r.phone,
        r.email,
        r.area,
        r.municipality,
        r.electoral_district,
        callStatusLabel(r.call_status),
        priorityGr(r.priority),
        r.political_stance,
        r.notes,
      ]
        .map(escapeCsvCell)
        .join(","),
    ),
  ];
  const csv = "\uFEFF" + lines.join("\r\n");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="epafes-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
