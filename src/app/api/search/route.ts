import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { fetchGroupNamesByContactId } from "@/lib/contact-group-members";
import { normalizeGreekName } from "@/lib/duplicate-detection";

export const dynamic = "force-dynamic";

function normQ(s: string) {
  return s.replace(/[%_\\]/g, " ").trim();
}

function escapeIlike(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function splitQueryParts(raw: string): string[] {
  return raw.split(/\s+/).filter(Boolean);
}

/** PostgREST ilike value; quote when pattern contains reserved characters. */
function ilikePattern(escaped: string, prefixOnly = false): string {
  const pat = prefixOnly ? `${escaped}%` : `%${escaped}%`;
  if (/[,\s().]/.test(pat)) {
    return `"${pat.replace(/"/g, '\\"')}"`;
  }
  return pat;
}

function ilikeFilter(column: string, escaped: string, prefixOnly = false): string {
  return `${column}.ilike.${ilikePattern(escaped, prefixOnly)}`;
}

function andIlike(firstCol: string, firstEsc: string, lastCol: string, lastEsc: string): string {
  return `and(${ilikeFilter(firstCol, firstEsc)},${ilikeFilter(lastCol, lastEsc)})`;
}

function buildContactDirectOrFilter(raw: string, esc: string, isPhone: boolean): string {
  const parts = splitQueryParts(raw);
  const normParts = parts.map((p) => escapeIlike(normalizeGreekName(p)));
  const phonePattern = isPhone ? ilikePattern(esc, true) : ilikePattern(esc);
  const textPattern = ilikePattern(esc);
  const otherFields = [
    `father_name.ilike.${textPattern}`,
    `mother_name.ilike.${textPattern}`,
    `phone.ilike.${phonePattern}`,
    `phone2.ilike.${phonePattern}`,
    `landline.ilike.${phonePattern}`,
    `email.ilike.${textPattern}`,
    `contact_code.ilike.${textPattern}`,
    `municipality.ilike.${textPattern}`,
    `area.ilike.${textPattern}`,
    `notes.ilike.${textPattern}`,
  ];

  if (parts.length >= 3) {
    const firstCombined = escapeIlike(normalizeGreekName(parts.slice(0, -1).join(" ")));
    const lastPart = normParts[normParts.length - 1]!;
    return [andIlike("first_name", firstCombined, "last_name", lastPart), ...otherFields].join(",");
  }

  if (parts.length === 2) {
    const [p1, p2] = normParts;
    return [
      andIlike("first_name", p1!, "last_name", p2!),
      andIlike("first_name", p2!, "last_name", p1!),
      ...otherFields,
    ].join(",");
  }

  return [
    `first_name.ilike.${textPattern}`,
    `last_name.ilike.${textPattern}`,
    ...otherFields,
  ].join(",");
}

function contactMatchesMultiPartName(
  row: { first_name: string; last_name: string },
  parts: string[],
): boolean {
  if (parts.length < 2) return false;
  const fn = normalizeGreekName(row.first_name);
  const ln = normalizeGreekName(row.last_name);
  const normParts = parts.map((p) => normalizeGreekName(p));

  if (parts.length >= 3) {
    const firstCombined = normalizeGreekName(parts.slice(0, -1).join(" "));
    const lastPart = normParts[normParts.length - 1]!;
    return fn.includes(firstCombined) && ln.includes(lastPart);
  }

  const [p1, p2] = normParts;
  return (
    (fn.includes(p1!) && ln.includes(p2!)) ||
    (fn.includes(p2!) && ln.includes(p1!))
  );
}

function snippet(text: string | null | undefined, q: string, max = 88): string | null {
  if (!text?.trim()) return null;
  const t = text.replace(/\s+/g, " ").trim();
  const low = t.toLowerCase();
  const qi = low.indexOf(q.toLowerCase());
  if (qi < 0) {
    return t.length > max ? `${t.slice(0, max)}…` : t;
  }
  const start = Math.max(0, qi - 22);
  const slice = t.slice(start, start + max);
  return (start > 0 ? "…" : "") + slice + (start + max < t.length ? "…" : "");
}

function hasQ(v: string | null | undefined, q: string) {
  if (v == null || !q) return false;
  return normalizeGreekName(v).includes(normalizeGreekName(q));
}

const CONTACT_SELECT =
  "id, first_name, last_name, phone, phone2, landline, municipality, email, contact_code, father_name, mother_name, area, notes, tags";

export type SearchContactHit = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  municipality: string | null;
  contact_code?: string | null;
  group_names?: string[];
  matchReasons: string[];
  aiMatch?: boolean;
};

export type SearchRequestHit = {
  id: string;
  request_code: string | null;
  title: string;
  status: string | null;
  snippet: string | null;
  requester_name?: string | null;
};

export type SearchTaskHit = { id: string; title: string; due_date: string | null; completed: boolean | null };

export type SearchCampaignHit = { id: string; name: string; status: string | null };

function contactFieldReasons(
  row: Record<string, unknown>,
  raw: string,
): { reasons: string[]; aiMatch: boolean } {
  const reasons: string[] = [];
  let aiMatch = false;
  const parts = splitQueryParts(raw);
  const nameRow = {
    first_name: String(row.first_name ?? ""),
    last_name: String(row.last_name ?? ""),
  };
  if (parts.length >= 2 && contactMatchesMultiPartName(nameRow, parts)) {
    reasons.push("Ταίριασμα σε όνομα και επώνυμο");
  } else if (hasQ(nameRow.first_name, raw) || hasQ(nameRow.last_name, raw)) {
    reasons.push("Ταίριασμα σε όνομα ή επώνυμο");
  }
  if (hasQ(row.father_name as string | null, raw)) {
    const sn = snippet(String(row.father_name), raw);
    if (sn) reasons.push(`Πατρώνυμο: «${sn}»`);
  }
  if (hasQ(row.mother_name as string | null, raw)) {
    const sn = snippet(String(row.mother_name), raw);
    if (sn) reasons.push(`Μητρώνυμο: «${sn}»`);
  }
  for (const k of ["phone", "phone2", "landline", "email", "contact_code"] as const) {
    if (hasQ(row[k] as string | null, raw)) {
      reasons.push(`Πεδίο «${k}»`);
    }
  }
  if (hasQ(row.municipality as string | null, raw)) {
    reasons.push(`Δήμος που ψηφίζει: «${String(row.municipality)}»`);
  }
  if (hasQ(row.area as string | null, raw)) {
    reasons.push(`Περιοχή: «${String(row.area)}»`);
  }
  if (hasQ(row.notes as string | null, raw)) {
    const sn = snippet(String(row.notes), raw);
    if (sn) {
      reasons.push(`Βρέθηκε στις σημειώσεις: «${sn}»`);
      aiMatch = true;
    }
  }
  const tags = row.tags as string[] | null | undefined;
  if (tags?.length) {
    const hit = tags.find((t) => hasQ(t, raw));
    if (hit) {
      reasons.push(`Ετικέτα: «${hit}»`);
    }
  }
  return { reasons, aiMatch };
}

function contactMatchTier(row: { first_name: string; last_name: string }, raw: string): number {
  const parts = splitQueryParts(raw);
  const q = normalizeGreekName(raw);
  const fn = normalizeGreekName(row.first_name);
  const ln = normalizeGreekName(row.last_name);
  const full = `${fn} ${ln}`.trim();

  if (parts.length >= 3) {
    const firstCombined = normalizeGreekName(parts.slice(0, -1).join(" "));
    const lastPart = normalizeGreekName(parts[parts.length - 1]!);
    if (fn === firstCombined && ln === lastPart) return 0;
    if (fn.includes(firstCombined) && ln.includes(lastPart)) return 1;
    if (full.startsWith(q)) return 1;
    return 2;
  }

  if (parts.length === 2) {
    const p1 = normalizeGreekName(parts[0]!);
    const p2 = normalizeGreekName(parts[1]!);
    if ((fn === p1 && ln === p2) || (fn === p2 && ln === p1)) return 0;
    if ((fn.includes(p1) && ln.includes(p2)) || (fn.includes(p2) && ln.includes(p1))) return 1;
    if (full.startsWith(q)) return 1;
    return 2;
  }

  if (fn === q || ln === q) return 0;
  if (full.startsWith(q)) return 1;
  return 2;
}

function requesterNameFromRow(row: Record<string, unknown>): string | null {
  const c = row.contacts;
  const contact = (Array.isArray(c) ? c[0] : c) as { first_name?: string; last_name?: string } | null | undefined;
  if (!contact) return null;
  const name = `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim();
  return name || null;
}

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "caller")) {
      return forbidden();
    }

    const raw = normQ(request.nextUrl.searchParams.get("q") ?? "");
    if (raw.length < 1) {
      return NextResponse.json({
        contacts: [] as SearchContactHit[],
        requests: [] as SearchRequestHit[],
        tasks: [] as SearchTaskHit[],
        campaigns: [] as SearchCampaignHit[],
      });
    }
    const esc = escapeIlike(normalizeGreekName(raw));
    const isPhone = /^\d{6,}$/.test(raw);
    const p = ilikePattern(esc);
    const contactOrFilter = buildContactDirectOrFilter(raw, esc, isPhone);

    const [
      cDirect,
      cNotes,
      cReq,
      rRes,
      tRes,
      caRes,
    ] = await Promise.all([
      supabase
        .from("contacts")
        .select(CONTACT_SELECT)
        .or(contactOrFilter)
        .limit(35),
      supabase.from("contact_notes").select("contact_id, content").ilike("content", `%${esc}%`).limit(45),
      supabase
        .from("requests")
        .select("id, contact_id, title, description")
        .or(`title.ilike.${p},description.ilike.${p}`)
        .limit(45),
      supabase
        .from("requests")
        .select("id, request_code, title, status, description, contact_id, contacts!contact_id(first_name, last_name)")
        .or(`title.ilike.${p},request_code.ilike.${p},description.ilike.${p}`)
        .limit(10),
      supabase.from("tasks").select("id, title, due_date, completed").or(`title.ilike.${p},description.ilike.${p}`).limit(5),
      supabase.from("campaigns").select("id, name, status").or(`name.ilike.${p},description.ilike.${p}`).limit(5),
    ]);

    if (cDirect.error) {
      return NextResponse.json({ error: cDirect.error.message }, { status: 400 });
    }

    const noteRows = (cNotes.data ?? []) as { contact_id: string; content: string }[];
    const noteByContact = new Map<string, { content: string }[]>();
    for (const n of noteRows) {
      const arr = noteByContact.get(n.contact_id) ?? [];
      arr.push({ content: n.content });
      noteByContact.set(n.contact_id, arr);
    }

    const reqContactRows = (cReq.data ?? []) as { contact_id: string; title: string; description: string | null }[];
    const reqByContact = new Map<string, { title: string; description: string | null }[]>();
    for (const r of reqContactRows) {
      const arr = reqByContact.get(r.contact_id) ?? [];
      arr.push({ title: r.title, description: r.description });
      reqByContact.set(r.contact_id, arr);
    }

    const extraIds = [
      ...new Set([...noteRows.map((n) => n.contact_id), ...reqContactRows.map((x) => x.contact_id)]),
    ].filter(Boolean);

    const extraMap = new Map<string, Record<string, unknown>>();
    if (extraIds.length) {
      const { data: ex } = await supabase.from("contacts").select(CONTACT_SELECT).in("id", extraIds.slice(0, 50));
      for (const row of (ex ?? []) as Record<string, unknown>[]) {
        extraMap.set(String(row.id), row);
      }
    }

    const byId = new Map<string, SearchContactHit>();

    const mergeContact = (hit: SearchContactHit) => {
      const prev = byId.get(hit.id);
      if (!prev) {
        byId.set(hit.id, hit);
        return;
      }
      const mergedReasons = [...new Set([...prev.matchReasons, ...hit.matchReasons])];
      byId.set(hit.id, {
        ...prev,
        matchReasons: mergedReasons,
        aiMatch: Boolean(prev.aiMatch || hit.aiMatch),
      });
    };

    for (const row of (cDirect.data ?? []) as Record<string, unknown>[]) {
      const { reasons, aiMatch: fieldAi } = contactFieldReasons(row, raw);
      const id = String(row.id);
      const noteHits = noteByContact.get(id);
      let ai = fieldAi;
      const allReasons = [...reasons];
      if (noteHits?.length) {
        for (const n of noteHits) {
          if (hasQ(n.content, raw)) {
            const sn = snippet(n.content, raw);
            if (sn) allReasons.push(`Βρέθηκε στις σημειώσεις: «${sn}»`);
            ai = true;
          }
        }
      }
      const rq = reqByContact.get(id);
      if (rq?.length) {
        for (const req of rq) {
          if (hasQ(req.title, raw) || hasQ(req.description, raw)) {
            const sn = snippet(req.description ?? req.title, raw);
            allReasons.push(`Βρέθηκε στο αίτημα: «${sn ?? req.title}»`);
            ai = true;
          }
        }
      }
      if (allReasons.length === 0) {
        allReasons.push("Ταίριασμα σε πεδία επαφής");
      }
      mergeContact({
        id,
        first_name: String(row.first_name ?? ""),
        last_name: String(row.last_name ?? ""),
        phone: (row.phone as string | null) ?? null,
        municipality: (row.municipality as string | null) ?? null,
        contact_code: (row.contact_code as string | null) ?? null,
        matchReasons: allReasons,
        aiMatch: ai,
      });
    }

    for (const id of extraIds) {
      if (byId.has(id)) continue;
      const row = extraMap.get(id);
      if (!row) continue;
      const allReasons: string[] = [];
      let ai = false;
      const noteHits = noteByContact.get(id);
      if (noteHits?.length) {
        for (const n of noteHits) {
          if (hasQ(n.content, raw)) {
            const sn = snippet(n.content, raw);
            if (sn) {
              allReasons.push(`Βρέθηκε στις σημειώσεις: «${sn}»`);
              ai = true;
            }
          }
        }
      }
      const rq = reqByContact.get(id);
      if (rq?.length) {
        for (const req of rq) {
          if (hasQ(req.title, raw) || hasQ(req.description, raw)) {
            const sn = snippet(req.description ?? req.title, raw);
            allReasons.push(`Βρέθηκε στο αίτημα: «${sn ?? req.title}»`);
            ai = true;
          }
        }
      }
      if (allReasons.length === 0) continue;
      mergeContact({
        id,
        first_name: String(row.first_name ?? ""),
        last_name: String(row.last_name ?? ""),
        phone: (row.phone as string | null) ?? null,
        municipality: (row.municipality as string | null) ?? null,
        contact_code: (row.contact_code as string | null) ?? null,
        matchReasons: allReasons,
        aiMatch: ai,
      });
    }

    const contactIds = [...byId.keys()];
    const groupNamesMap = contactIds.length ? await fetchGroupNamesByContactId(supabase, contactIds) : new Map<string, string[]>();

    const contacts = [...byId.values()]
      .map((hit) => ({
        ...hit,
        group_names: groupNamesMap.get(hit.id) ?? [],
      }))
      .sort((a, b) => contactMatchTier(a, raw) - contactMatchTier(b, raw))
      .slice(0, 15);

    const requests: SearchRequestHit[] = ((rRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      request_code: (row.request_code as string | null) ?? null,
      title: String(row.title ?? ""),
      status: (row.status as string | null) ?? null,
      snippet: snippet(String(row.description ?? row.title ?? ""), raw),
      requester_name: requesterNameFromRow(row),
    }));

    const tasks: SearchTaskHit[] = (tRes.data ?? []) as SearchTaskHit[];
    const campaigns: SearchCampaignHit[] = (caRes.data ?? []) as SearchCampaignHit[];

    return NextResponse.json({ contacts, requests, tasks, campaigns });
  } catch (e) {
    console.error("[api/search]", e);
    return nextJsonError();
  }
}
