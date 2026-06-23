import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { hasPermissionFlexible } from "@/lib/permission-check";
import { actionPayloadSchema, type ActionPayload } from "@/lib/ai-assistant-actions";
import { REQUEST_STATUS_OPEN } from "@/lib/request-statuses";
import {
  applyFindContactsToolInput,
  contactFiltersToSearchParams,
  getDefaultContactFilters,
} from "@/lib/contacts-filters";
import { alexandraContactSearchLimit } from "@/lib/alexandra-contact-search";
import { resolveContactMunicipalityForWrite } from "@/lib/municipality-search";
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile, supabase } = crm;

  let action: ActionPayload;
  try {
    const raw = (await request.json()) as { action?: unknown };
    const p = actionPayloadSchema.safeParse(raw?.action != null ? raw.action : raw);
    if (!p.success) {
      return NextResponse.json({ error: "Άκυρη ενέργεια" }, { status: 400 });
    }
    action = p.data;
  } catch {
    return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
  }

  const isMgr = hasMinRole(profile?.role, "manager", profile?.access_tier);
  const canEditContacts = await hasPermissionFlexible(
    user.id,
    "contacts_edit",
    isMgr,
  );
  const isLimitedContactEditor = !canEditContacts;
  const origin = request.nextUrl.origin;
  const cookie = request.headers.get("cookie") ?? "";

  const forward = async (path: string, init: RequestInit) => {
    const h = new Headers(init.headers as HeadersInit);
    h.set("cookie", cookie);
    return fetch(new URL(path, origin), { ...init, headers: h });
  };

  if (action.action === "find_contacts") {
    let f = getDefaultContactFilters();
    if (action.filters && typeof action.filters === "object") {
      f = applyFindContactsToolInput(f, action.filters as Record<string, unknown>, new Map());
    }
    const displayLimit = alexandraContactSearchLimit({ limit: (action as { limit?: number }).limit });
    f.limit = "";
    const params = contactFiltersToSearchParams(f);
    params.set("page", "1");
    params.set("page_size", String(displayLimit));
    const r = await forward(`/api/contacts?${params.toString()}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: unknown[]; total?: number; error?: string };
    if (!r.ok) {
      return NextResponse.json({ error: j.error || "Σφάλμα" }, { status: 400 });
    }
    const list = (j.contacts ?? []).slice(0, displayLimit);
    const total = typeof j.total === "number" ? j.total : list.length;
    return NextResponse.json({
      ok: true,
      message: `Βρέθηκαν ${total.toLocaleString("el-GR")} επαφές${total > list.length ? ` (εμφανίζονται ${list.length})` : ""}`,
      total_count: total,
      findResults: list,
    });
  }

  if (action.action === "create_contact") {
    if (!isMgr) {
      return forbidden();
    }
    const body = { ...action.data } as Record<string, unknown>;
    if (typeof body.municipality === "string" && body.municipality.trim()) {
      const resolved = await resolveContactMunicipalityForWrite(supabase, body.municipality);
      body.municipality = resolved.municipality;
    }
    const r = await forward("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { error?: string; contact?: unknown };
    if (!r.ok) {
      return NextResponse.json({ error: j.error || "Σφάλμα" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Η επαφή δημιουργήθηκε.", result: j.contact });
  }

  if (action.action === "add_note") {
    if (!isMgr) {
      return forbidden();
    }
    const { data: cur, error: e0 } = await supabase
      .from("contacts")
      .select("notes")
      .eq("id", action.contact_id)
      .single();
    if (e0) {
      return NextResponse.json({ error: e0.message }, { status: 400 });
    }
    const nextNote = [cur?.notes, action.note].filter(Boolean).join("\n\n");
    const { error: e1 } = await supabase
      .from("contacts")
      .update({ notes: nextNote })
      .eq("id", action.contact_id);
    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Η σημείωση αποθηκεύτηκε." });
  }

  if (action.action === "add_task") {
    if (!isMgr) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        contact_id: action.contact_id,
        title: action.title.trim(),
        due_date: action.due_date || null,
        completed: false,
      })
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Η εργασία προστέθηκε.", id: data?.id });
  }

  if (action.action === "complete_task") {
    if (!isMgr) {
      return forbidden();
    }
    const r = await forward(`/api/tasks/${action.task_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      return NextResponse.json({ error: j.error || "Σφάλμα" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Η εργασία σημειώθηκε ως ολοκληρωμένη." });
  }

  if (action.action === "create_request") {
    if (!isMgr) {
      return forbidden();
    }
    const r = await forward("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: action.contact_id,
        title: action.title,
        category: action.category ?? "Άλλο",
        description: action.description ?? null,
        status: REQUEST_STATUS_OPEN,
      }),
    });
    const j = (await r.json()) as { error?: string; request?: unknown };
    if (!r.ok) {
      return NextResponse.json({ error: j.error || "Σφάλμα" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Το αίτημα δημιουργήθηκε.", result: j.request });
  }

  if (action.action === "update_request") {
    if (!isMgr) {
      return forbidden();
    }
    const r = await forward(`/api/requests/${action.request_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action.status }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      return NextResponse.json({ error: j.error || "Σφάλμα" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Το αίτημα ενημερώθηκε." });
  }

  if (action.action === "update_status") {
    if (isLimitedContactEditor) {
      const { data, error } = await supabase
        .from("contacts")
        .update({ call_status: action.status })
        .eq("id", action.contact_id)
        .select("id")
        .single();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Η κατάσταση κλήσης ενημερώθηκε.", id: data?.id });
    }
    if (!isMgr) {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("contacts")
      .update({ call_status: action.status })
      .eq("id", action.contact_id)
      .select("id")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Η κατάσταση ενημερώθηκε.", id: data?.id });
  }

  if (action.action === "start_call") {
    if (!isMgr) {
      return forbidden();
    }
    const r = await forward("/api/retell/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: action.contact_id }),
    });
    const j = await r.json();
    if (!r.ok) {
      return NextResponse.json({ error: (j as { error?: string }).error || JSON.stringify(j) }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: "Η κλήση ξεκίνησε (Retell)." });
  }

  if (action.action === "start_campaign_calls" || action.action === "start_calls") {
    if (!isMgr) {
      return forbidden();
    }
    const f = (action as { action: "start_calls" | "start_campaign_calls"; filter?: { call_status?: string; area?: string } })
      .filter ?? {};
    let q = supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, call_status, area, municipality")
      .not("phone", "is", null);
    if (f.call_status) {
      q = q.eq("call_status", f.call_status);
    } else if (!f.area) {
      q = q.eq("call_status", "Pending");
    }
    if (f.area) {
      q = q.or(`area.ilike.%${f.area}%,municipality.ilike.%${f.area}%`);
    }
    q = q.limit(5);
    const { data: list, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const withPhone = (list ?? []).filter(
      (c: { phone: string | null }) => c.phone && String(c.phone).replace(/\D/g, "").length >= 8,
    );
    if (withPhone.length === 0) {
      return NextResponse.json({ ok: false, message: "Δεν βρέθηκαν επαφές με τηλέφωνο." });
    }
    const results: { id: string; ok: boolean; err?: string }[] = [];
    for (const c of withPhone.slice(0, 3)) {
      const r = await fetch(new URL("/api/retell/call", request.nextUrl.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({ contact_id: c.id }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: unknown; success?: boolean };
      results.push({ id: c.id, ok: r.ok, err: r.ok ? undefined : JSON.stringify(j.error ?? j) });
    }
    const started = results.filter((x) => x.ok).length;
    return NextResponse.json({
      ok: started > 0,
      message: `Ξεκίνησαν ${started} εξερχόμενη/ες κλήση/εις (έως 3).`,
      results,
    });
  }

  return NextResponse.json({ error: "Άγνωστη ενέργεια" }, { status: 400 });
}

