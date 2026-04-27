import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { logActivity } from "@/lib/activity-log";
import { firstNameFromFull } from "@/lib/activity-descriptions";
import { nameDayDateStringFromFirstName } from "@/lib/greek-namedays";
import { nextJsonError } from "@/lib/api-resilience";
import { runIndexRangeWithConcurrency } from "@/lib/async-pool";
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(5000),
  fields: z.record(z.string(), z.unknown()),
});

const ALLOW = new Set([
  "first_name",
  "last_name",
  "phone",
  "phone2",
  "landline",
  "email",
  "age",
  "gender",
  "occupation",
  "nickname",
  "spouse_name",
  "municipality",
  "electoral_district",
  "toponym",
  "political_stance",
  "priority",
  "call_status",
  "notes",
  "area",
  "tags",
  "influence",
  "name_day",
  "father_name",
  "mother_name",
  "birthday",
  "source",
  "group_id",
  "last_contacted_at",
]);

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const { contact_ids, fields } = parsed.data;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (ALLOW.has(k) && v !== undefined) {
        body[k] = v;
      }
    }
    if (Object.keys(body).length === 0) {
      return NextResponse.json({ error: "Καθόλου επιτρεπτά πεδία" }, { status: 400 });
    }
    if (!("name_day" in body) && body.first_name !== undefined) {
      const iso = nameDayDateStringFromFirstName(String(body.first_name));
      if (iso) body.name_day = iso;
    }

    let ok = 0;
    const errors: { id: string; err: string }[] = [];
    await runIndexRangeWithConcurrency(0, contact_ids.length, 8, async (i) => {
      const id = contact_ids[i]!;
      const { error } = await supabase.from("contacts").update(body).eq("id", id);
      if (error) {
        errors.push({ id, err: error.message });
      } else {
        ok += 1;
      }
    });

    await logActivity({
      userId: user.id,
      action: "contact_updated",
      entityType: "contact",
      entityId: contact_ids[0]!,
      entityName: `Μαζική ενημέρωση ${contact_ids.length} επαφών`,
      details: {
        actor_name: firstNameFromFull(profile?.full_name),
        count: contact_ids.length,
        fields: Object.keys(body),
        error_count: errors.length,
        bulk: true,
      },
    });

    return NextResponse.json({ ok: true, updated: ok, failed: errors.length, sample_errors: errors.slice(0, 10) });
  } catch (e) {
    console.error("[manager-bulk-update]", e);
    return nextJsonError();
  }
}
