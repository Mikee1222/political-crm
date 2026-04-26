import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
import { addDaysYmd, computeSlaStatus } from "@/lib/request-sla";
import { inferRequestCategoryFromDescription } from "@/lib/request-auto-category";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const status = request.nextUrl.searchParams.get("status");
  const category = request.nextUrl.searchParams.get("category");

  let query = supabase
    .from("requests")
    .select(
      "id, request_code, title, description, category, status, priority, assigned_to, created_at, updated_at, contact_id, affected_contact_id, sla_due_date, sla_status, contacts(first_name,last_name,phone)",
    )
    .order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const requests = (data ?? []).map((row) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    const r = row as {
      sla_due_date?: string | null;
      status?: string | null;
    };
    const slaUi = computeSlaStatus(r.sla_due_date ?? null, r.status ?? null);
    return { ...row, contacts: contact ?? null, slaUi };
  });
  return NextResponse.json({ requests });
  } catch (e) {
    console.error("[api/requests GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const body = (await request.json()) as Record<string, unknown>;
  const initialNote = String((body as { initial_note?: string }).initial_note ?? "").trim();
  const contactId = String((body as { contact_id?: string }).contact_id ?? "").trim();
  if (!contactId) {
    return NextResponse.json({ error: "Απαιτείται «Πρόσωπο που το ζήτησε»" }, { status: 400 });
  }
  const title = String((body as { title?: string }).title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Απαιτείται τίτλος" }, { status: 400 });
  }
  const descRaw = String((body as { description?: string }).description ?? "");
  const catRaw = (body as { category?: string }).category;
  let categoryName =
    catRaw != null && String(catRaw).trim() !== "" ? String(catRaw).trim() : "";
  if (!categoryName) {
    const inferred = await inferRequestCategoryFromDescription(descRaw);
    if (inferred) {
      categoryName = inferred;
    } else {
      categoryName = "Άλλο";
    }
  }
  const { data: catRow } = await supabase
    .from("request_categories")
    .select("sla_days")
    .eq("name", categoryName)
    .maybeSingle();
  const slaDays =
    typeof (catRow as { sla_days?: number } | null)?.sla_days === "number"
      ? (catRow as { sla_days: number }).sla_days
      : 14;
  const st = (body as { status?: string }).status ?? "Νέο";
  const now = new Date();
  const formSla = (body as { sla_due_date?: string | null }).sla_due_date;
  const explicitSla =
    typeof formSla === "string" && /^\d{4}-\d{2}-\d{2}$/.test(formSla.trim());
  const slaDue = explicitSla
    ? formSla.trim()
    : addDaysYmd(now.toISOString(), slaDays);
  const pr = String((body as { priority?: string }).priority ?? "Medium");
  const priority = pr === "High" || pr === "Low" || pr === "Medium" ? pr : "Medium";
  const affectedRaw = (body as { affected_contact_id?: string | null }).affected_contact_id;
  const affectedContactId =
    affectedRaw == null || String(affectedRaw).trim() === "" ? null : String(affectedRaw).trim();
  const assigned = (body as { assigned_to?: string | null }).assigned_to;
  const assignedTo =
    assigned != null && String(assigned).trim() !== "" ? String(assigned).trim() : null;
  const insertRow: Record<string, unknown> = {
    contact_id: contactId,
    affected_contact_id: affectedContactId,
    title,
    description: (body as { description?: string }).description
      ? String((body as { description?: string }).description)
      : null,
    category: categoryName,
    status: st,
    priority,
    assigned_to: assignedTo,
  };
  const code = await nextPaddedCode(supabase, "requests", "request_code", "AIT");
  const slaStatus = computeSlaStatus(slaDue, String(st));
  const payload = {
    ...insertRow,
    request_code: code,
    updated_at: new Date().toISOString(),
    sla_due_date: slaDue,
    sla_status: slaStatus,
  };
  const { data, error } = await supabase.from("requests").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const newId = (data as { id: string }).id;
  if (initialNote) {
    const { error: noteErr } = await supabase
      .from("request_notes")
      .insert({ request_id: newId, user_id: user.id, content: initialNote });
    if (noteErr) {
      await supabase.from("requests").delete().eq("id", newId);
      return NextResponse.json(
        { error: noteErr.message || "Δεν αποθηκεύτηκε η αρχική σημείωση" },
        { status: 400 },
      );
    }
  }
  const logTitle = String((data as { title?: string }).title ?? "Αίτημα");
  await logActivity({
    userId: user.id,
    action: "request_created",
    entityType: "request",
    entityId: (data as { id: string }).id,
    entityName: logTitle,
    details: { actor_name: firstNameFromFull(profile?.full_name) },
  });
  return NextResponse.json({ request: data });
  } catch (e) {
    console.error("[api/requests POST]", e);
    return nextJsonError();
  }
}
