import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { nextJsonError } from "@/lib/api-resilience";
import { CAL_EVENT_TYPE_KEYS, type CalendarEventType } from "@/lib/calendar-event-types";
import type { EventCategoryRow } from "@/lib/event-categories";
export const dynamic = "force-dynamic";

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

function isTypeKey(s: string): s is CalendarEventType {
  return (CAL_EVENT_TYPE_KEYS as readonly string[]).includes(s);
}

export async function GET() {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const { data, error } = await supabase
      .from("event_categories")
      .select("type_key, name, color, updated_at")
      .in("type_key", [...CAL_EVENT_TYPE_KEYS])
      .order("type_key", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ categories: (data ?? []) as EventCategoryRow[] });
  } catch (e) {
    console.error("[api/admin/event-categories GET]", e);
    return nextJsonError();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      categories?: Array<{ type_key: string; name: string; color: string }>;
    };
    const list = body.categories;
    if (!list || !Array.isArray(list) || list.length === 0) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const now = new Date().toISOString();
    for (const row of list) {
      if (!row.type_key || !isTypeKey(String(row.type_key).trim())) {
        return NextResponse.json({ error: "Άκυρο type_key" }, { status: 400 });
      }
      const name = String(row.name ?? "").trim();
      if (!name) {
        return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
      }
      const color = String(row.color ?? "").trim() || "#6B7280";
      if (!HEX.test(color)) {
        return NextResponse.json({ error: "Άκυρο χρώμα (HEX #RRGGBB)" }, { status: 400 });
      }
      const { error } = await supabase.from("event_categories").upsert(
        {
          type_key: row.type_key.trim() as CalendarEventType,
          name,
          color,
          updated_at: now,
        },
        { onConflict: "type_key" },
      );
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[api/admin/event-categories PUT]", e);
    return nextJsonError();
  }
}
