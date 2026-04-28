import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { hasPermissionFlexible } from "@/lib/permission-check";
import { createServiceClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nextJsonError } from "@/lib/api-resilience";
import { queryContactsList } from "@/lib/contacts-query";
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  user_confirmed: z.boolean(),
  contact_ids: z.array(z.string().uuid()).min(1).max(20_000).optional(),
  /** Ίδια κλειδιά με φίλτρα αναζήτησης επαφών (search|name, call_status, municipality, …) */
  filters: z.record(z.string(), z.unknown()).optional(),
});

function normalizeFilters(
  f: Record<string, unknown> | undefined,
): Parameters<typeof queryContactsList>[1] {
  if (!f) {
    return {};
  }
  const g = (k: string) => f[k];
  const str = (k: string) => (g(k) != null ? String(g(k)).trim() : "");
  const num = (k: string) => {
    const n = g(k);
    if (n == null) return undefined;
    const v = Number(n);
    return Number.isFinite(v) ? v : undefined;
  };
  const out: Parameters<typeof queryContactsList>[1] = {};
  const s = str("search") || str("name");
  if (s) out.search = s;
  if (str("call_status")) out.call_status = str("call_status");
  if (str("area")) out.area = str("area");
  if (str("municipality")) out.municipality = str("municipality");
  if (str("priority")) out.priority = str("priority");
  if (str("tag")) out.tag = str("tag");
  if (str("group_id")) out.group_id = str("group_id");
  if (str("phone")) out.phone = str("phone");
  if (str("political_stance")) out.political_stance = str("political_stance");
  const a1 = num("age_min");
  if (a1 != null) out.age_min = a1;
  const a2 = num("age_max");
  if (a2 != null) out.age_max = a2;
  return out;
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!(await hasPermissionFlexible(user.id, "alexandra_bulk_delete", hasMinRole(profile?.role, "manager")))) {
      return forbidden();
    }
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const { user_confirmed, contact_ids, filters: rawFilters } = parsed.data;
    if (!contact_ids?.length && !rawFilters) {
      return NextResponse.json({ error: "Χρειάζονται contact_ids ή filters" }, { status: 400 });
    }

    const filters = normalizeFilters(rawFilters);
    type Row = { id: string; first_name: string; last_name: string; phone: string | null };
    let rows: Row[] = [];

    if (contact_ids?.length) {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, phone")
        .in("id", contact_ids);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      rows = (data ?? []) as Row[];
    } else {
      const { error, contacts } = await queryContactsList(supabase, filters, 10_000);
      if (error) {
        return NextResponse.json({ error }, { status: 400 });
      }
      rows = (contacts as Row[]).map((c) => ({
        id: c.id as string,
        first_name: c.first_name as string,
        last_name: c.last_name as string,
        phone: c.phone as string | null,
      }));
    }

    if (!user_confirmed) {
      const sample = rows.slice(0, 20).map((r) => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`.trim(),
        phone: r.phone,
      }));
      return NextResponse.json({
        mode: "preview" as const,
        would_delete: rows.length,
        message:
          "Επιβεβαίωση απαιτείται. Αν ο χρήστης συμφωνεί ρητά, ξανακάλεσε bulk_delete_contacts με user_confirmed: true (ίδια contact_ids ή filters).",
        sample,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }

    const ids = rows.map((r) => r.id);
    const admin = createServiceClient();
    const chunk = 200;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += chunk) {
      const part = ids.slice(i, i + chunk);
      const { error: delErr } = await admin.from("contacts").delete().in("id", part);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 400 });
      }
      deleted += part.length;
    }

    await logActivity({
      userId: user.id,
      action: "contact_updated",
      entityType: "contact",
      entityId: ids[0]!,
      entityName: `Μαζική διαγραφή ${deleted} επαφών`,
      details: {
        actor_name: firstNameFromFull(profile?.full_name),
        deleted,
        by_filters: !contact_ids?.length,
        bulk: true,
        action: "bulk_delete",
      },
    });

    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error("[manager-bulk-delete]", e);
    return nextJsonError();
  }
}
