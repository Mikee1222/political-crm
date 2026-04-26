import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import {
  applyContactListFiltersToBuilder,
  buildContactsQueryFromListFilters,
  contactMatchesLocalSearch,
} from "@/lib/contacts-query";
import { getDefaultContactFilters, searchParamsToFilters } from "@/lib/contacts-filters";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { callStatusLabel } from "@/lib/luxury-styles";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = 'force-dynamic';

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
  "id, first_name, last_name, phone, phone2, landline, email, area, municipality, electoral_district, call_status, priority, political_stance, notes, nickname, predicted_score";

export async function GET(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  if (!hasMinRole(profile?.role, "caller")) {
    return forbidden();
  }

  const sp = request.nextUrl.searchParams;
  const idsParam = sp.get("ids");
  const filtered = sp.get("filters") === "1" || sp.get("filtered") === "1";
  const f = searchParamsToFilters(sp, getDefaultContactFilters());

  const isManager = hasMinRole(profile?.role, "manager");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase.from("contacts").select(SELECT_EXPORT);

  if (idsParam?.trim()) {
    const ids = idsParam
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (ids.length) query = query.in("id", ids);
  } else if (filtered && f.nameday_today) {
    const now = new Date();
    const ids = await getContactIdsForNameDay(supabase, now.getMonth() + 1, now.getDate());
    if (ids.length === 0) {
      query = supabase.from("contacts").select(SELECT_EXPORT).limit(0);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let qn: any = supabase.from("contacts").select(SELECT_EXPORT).in("id", ids);
      qn = applyContactListFiltersToBuilder(qn, f);
      query = qn;
    }
  } else if (filtered) {
    query = buildContactsQueryFromListFilters(supabase, f);
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
    phone2: string | null;
    landline: string | null;
    email: string | null;
    area: string | null;
    municipality: string | null;
    electoral_district: string | null;
    call_status: string | null;
    priority: string | null;
    political_stance: string | null;
    notes: string | null;
    nickname: string | null;
    predicted_score: number | null;
  }>;

  if (filtered && f.search?.trim()) {
    rawRows = rawRows.filter((c) => contactMatchesLocalSearch(c, f.search));
  }

  const rows = rawRows;

  const header = [
    "Μικρό Όνομα",
    "Επίθετο",
    "Κινητό 1",
    "Κινητό 2",
    "Σταθερό",
    "Email",
    "Περιοχή",
    "Δήμος",
    "Εκλογικό Διαμέρισμα",
    "Κατάσταση",
    "Προτεραιότητα",
    "Πολιτική Τοποθέτηση",
    "Σκορ (0-100)",
    "Σημειώσεις",
  ];
  const lines = [
    header.map(escapeCsvCell).join(","),
    ...rows.map((r) =>
      [
        r.first_name,
        r.last_name,
        r.phone,
        r.phone2,
        r.landline,
        r.email,
        r.area,
        r.municipality,
        r.electoral_district,
        callStatusLabel(r.call_status),
        priorityGr(r.priority),
        r.political_stance,
        r.predicted_score ?? "",
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
  } catch (e) {
    console.error("[api/contacts/export]", e);
    return nextJsonError();
  }
}
