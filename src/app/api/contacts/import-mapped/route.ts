import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextResponse } from "next/server";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import { nextPaddedCode } from "@/lib/codes";
import { nameDayDateStringFromFirstName } from "@/lib/greek-namedays";
import {
  buildImportDedupIndex,
  findDuplicateForRow,
  type DuplicateMatch,
  type ImportContactRow,
} from "@/lib/import-dedup";
import { resolveDuplicateMode } from "@/lib/chunked-contact-import";

export const dynamic = "force-dynamic";

const rowSchema = z.object({
  first_name: z.string().min(1).max(400),
  last_name: z.string().min(1).max(400),
  phone: z.string().min(1).max(40),
  phone2: z.string().max(40).nullish().transform((v) => (v == null || v === "" ? null : v)),
  landline: z.string().max(40).nullish().transform((v) => (v == null || v === "" ? null : v)),
  email: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  area: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  municipality: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  electoral_district: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  toponym: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  political_stance: z.string().max(500).nullish().transform((v) => (v == null || v === "" ? null : v)),
  notes: z.string().max(10000).nullish().transform((v) => (v == null || v === "" ? null : v)),
  father_name: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  mother_name: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  tags: z.array(z.string().max(200)).nullish(),
  group: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  call_status: z.enum(["Pending", "Positive", "Negative", "No Answer"]).optional(),
  priority: z.enum(["High", "Medium", "Low"]).optional(),
});

const bodySchema = z.object({
  contacts: z.array(rowSchema).min(1).max(200),
  dry_run: z.boolean().optional(),
  duplicate_mode: z.enum(["skip", "update"]).optional(),
  skip_duplicates: z.boolean().optional(),
  update_existing: z.boolean().optional(),
});

type InsertRow = {
  first_name: string;
  last_name: string;
  phone: string;
  phone2: string | null;
  landline: string | null;
  email: string | null;
  area: string | null;
  municipality: string | null;
  electoral_district: string | null;
  toponym: string | null;
  political_stance: string | null;
  notes: string | null;
  father_name: string | null;
  mother_name: string | null;
  call_status: string;
  priority: string;
  tags: string[] | null;
  group_id: string | null;
};

const UPDATE_FIELDS = [
  "first_name",
  "last_name",
  "father_name",
  "mother_name",
  "phone2",
  "landline",
  "email",
  "area",
  "municipality",
  "electoral_district",
  "toponym",
  "political_stance",
  "notes",
  "call_status",
  "priority",
  "tags",
] as const;

export const maxDuration = 120;

async function resolveGroupId(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  name: string | null | undefined,
): Promise<string | null> {
  if (!name?.trim()) return null;
  const t = name.trim();
  const { data } = await supabase.from("contact_groups").select("id,name").ilike("name", t).limit(5);
  const exact = (data ?? []).find((r) => String((r as { name: string }).name).trim().toLowerCase() === t.toLowerCase());
  if (exact) return String((exact as { id: string }).id);
  const first = (data ?? [])[0] as { id: string } | undefined;
  return first?.id ?? null;
}

function toImportContactRow(r: z.infer<typeof rowSchema>): ImportContactRow {
  return {
    first_name: r.first_name.trim(),
    last_name: r.last_name.trim(),
    phone: r.phone.trim(),
    phone2: r.phone2,
    landline: r.landline,
    father_name: r.father_name,
  };
}

export async function POST(request: Request) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const raw = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
    }
    const { contacts: rows, dry_run } = parsed.data;
    const dupMode = resolveDuplicateMode(parsed.data);

    const index = await buildImportDedupIndex(
      supabase,
      rows.map(toImportContactRow),
    );

    const duplicates: DuplicateMatch[] = [];
    for (let i = 0; i < rows.length; i++) {
      const dup = findDuplicateForRow(toImportContactRow(rows[i]!), i + 1, index);
      if (dup) duplicates.push(dup);
    }

    if (dry_run) {
      return NextResponse.json({
        duplicates,
        would_insert: rows.length - duplicates.length,
        would_update: dupMode === "update" ? duplicates.length : 0,
        would_skip: dupMode === "skip" ? duplicates.length : 0,
        processed: rows.length,
      });
    }

    let inserted = 0;
    let updated = 0;
    let skipped_duplicates = 0;
    let errorCount = 0;
    const lastErrors: { phone: string; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const dup = findDuplicateForRow(toImportContactRow(r), i + 1, index);

      if (dup) {
        if (dupMode === "skip") {
          skipped_duplicates += 1;
          continue;
        }
        const patch: Record<string, unknown> = {};
        for (const k of UPDATE_FIELDS) {
          const v = r[k as keyof typeof r];
          if (v !== undefined && v !== null && v !== "") {
            patch[k] = v;
          }
        }
        const group_id = await resolveGroupId(supabase, r.group);
        if (group_id) patch.group_id = group_id;
        const { error } = await supabase.from("contacts").update(patch).eq("id", dup.contact_id);
        if (error) {
          errorCount += 1;
          if (lastErrors.length < 12) {
            lastErrors.push({ phone: r.phone, message: error.message });
          }
        } else {
          updated += 1;
        }
        continue;
      }

      const code = await nextPaddedCode(supabase, "contacts", "contact_code", "EP");
      const autoNd = nameDayDateStringFromFirstName(r.first_name);
      const group_id = await resolveGroupId(supabase, r.group);
      const rec: InsertRow & { contact_code: string; name_day: string | null } = {
        first_name: r.first_name.trim() || "—",
        last_name: r.last_name.trim() || "—",
        phone: r.phone.trim(),
        phone2: r.phone2?.trim() || null,
        landline: r.landline?.trim() || null,
        email: r.email,
        area: r.area,
        municipality: r.municipality,
        electoral_district: r.electoral_district,
        toponym: r.toponym,
        political_stance: r.political_stance,
        notes: r.notes,
        father_name: r.father_name,
        mother_name: r.mother_name,
        call_status: r.call_status ?? "Pending",
        priority: r.priority ?? "Medium",
        tags: r.tags && r.tags.length ? r.tags : null,
        group_id,
        contact_code: code,
        name_day: autoNd,
      };
      const { error } = await supabase.from("contacts").insert(rec);
      if (error) {
        errorCount += 1;
        if (lastErrors.length < 12) {
          lastErrors.push({ phone: r.phone, message: error.message });
        }
      } else {
        inserted += 1;
      }
    }

    return NextResponse.json({
      inserted,
      updated,
      skipped_duplicates,
      errors: errorCount,
      errorDetails: lastErrors,
      duplicates: duplicates.slice(0, 20),
      processed: rows.length,
    });
  } catch (e) {
    console.error("[api/contacts/import-mapped]", e);
    return nextJsonError();
  }
}
