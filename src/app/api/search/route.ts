import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

function normQ(s: string) {
  return s.replace(/[%_\\]/g, " ").trim();
}

function escapeIlike(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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
  return v.toLowerCase().includes(q.toLowerCase());
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
  matchReasons: string[];
  aiMatch?: boolean;
};

export type SearchRequestHit = {
  id: string;
  request_code: string | null;
  title: string;
  status: string | null;
  snippet: string | null;
};

export type SearchTaskHit = { id: string; title: string; due_date: string | null; completed: boolean | null };

export type SearchCampaignHit = { id: string; name: string; status: string | null };

function contactFieldReasons(row: Record<string, unknown>, raw: string): { reasons: string[]; aiMatch: boolean } {
  const reasons: string[] = [];
  let aiMatch = false;
  if (hasQ(String(row.first_name ?? ""), raw) || hasQ(String(row.last_name ?? ""), raw)) {
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
    reasons.push(`Δήμος: «${String(row.municipality)}»`);
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

export async function GET(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "caller")) {
      return forbidden();
    }

    const raw = normQ(request.nextUrl.searchParams.get("q") ?? "");
    if (raw.length < 2) {
      return NextResponse.json({
        contacts: [] as SearchContactHit[],
        requests: [] as SearchRequestHit[],
        tasks: [] as SearchTaskHit[],
        campaigns: [] as SearchCampaignHit[],
      });
    }
    const p = `%${escapeIlike(raw)}%`;

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
        .or(
          [
            `first_name.ilike.${p}`,
            `last_name.ilike.${p}`,
            `father_name.ilike.${p}`,
            `mother_name.ilike.${p}`,
            `phone.ilike.${p}`,
            `phone2.ilike.${p}`,
            `landline.ilike.${p}`,
            `email.ilike.${p}`,
            `contact_code.ilike.${p}`,
            `municipality.ilike.${p}`,
            `area.ilike.${p}`,
            `notes.ilike.${p}`,
          ].join(","),
        )
        .limit(28),
      supabase.from("contact_notes").select("contact_id, content").ilike("content", p).limit(45),
      supabase
        .from("requests")
        .select("id, contact_id, title, description")
        .or(`title.ilike.${p},description.ilike.${p}`)
        .limit(45),
      supabase
        .from("requests")
        .select("id, request_code, title, status, description")
        .or(`title.ilike.${p},request_code.ilike.${p},description.ilike.${p}`)
        .limit(14),
      supabase.from("tasks").select("id, title, due_date, completed").or(`title.ilike.${p},description.ilike.${p}`).limit(14),
      supabase.from("campaigns").select("id, name, status").or(`name.ilike.${p},description.ilike.${p}`).limit(14),
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

    const contacts = [...byId.values()].slice(0, 12);

    const requests: SearchRequestHit[] = ((rRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      request_code: (row.request_code as string | null) ?? null,
      title: String(row.title ?? ""),
      status: (row.status as string | null) ?? null,
      snippet: snippet(String(row.description ?? row.title ?? ""), raw),
    }));

    const tasks: SearchTaskHit[] = (tRes.data ?? []) as SearchTaskHit[];
    const campaigns: SearchCampaignHit[] = (caRes.data ?? []) as SearchCampaignHit[];

    return NextResponse.json({ contacts, requests, tasks, campaigns });
  } catch (e) {
    console.error("[api/search]", e);
    return nextJsonError();
  }
}
