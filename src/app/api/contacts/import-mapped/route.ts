import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";

const rowSchema = z.object({
  first_name: z.string().min(1).max(400),
  last_name: z.string().min(1).max(400),
  phone: z.string().min(1).max(40),
  email: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  area: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  municipality: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  electoral_district: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  toponym: z.string().max(400).nullish().transform((v) => (v == null || v === "" ? null : v)),
  political_stance: z.string().max(500).nullish().transform((v) => (v == null || v === "" ? null : v)),
  notes: z.string().max(10000).nullish().transform((v) => (v == null || v === "" ? null : v)),
  call_status: z.literal("Pending").optional(),
  priority: z.enum(["High", "Medium", "Low"]).optional(),
});

const bodySchema = z.object({
  contacts: z.array(rowSchema).min(1).max(2000),
});

type InsertRow = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  area: string | null;
  municipality: string | null;
  electoral_district: string | null;
  toponym: string | null;
  political_stance: string | null;
  notes: string | null;
  call_status: string;
  priority: string;
};

export const maxDuration = 120;

export async function POST(request: Request) {
  const { user, profile, supabase } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Άκυρα δεδομένα" }, { status: 400 });
  }
  const { contacts: rows } = parsed.data;

  let inserted = 0;
  let errorCount = 0;
  const lastErrors: { phone: string; message: string }[] = [];
  for (const r of rows) {
    const rec: InsertRow = {
      first_name: r.first_name.trim() || "—",
      last_name: r.last_name.trim() || "—",
      phone: r.phone.trim(),
      email: r.email,
      area: r.area,
      municipality: r.municipality,
      electoral_district: r.electoral_district,
      toponym: r.toponym,
      political_stance: r.political_stance,
      notes: r.notes,
      call_status: r.call_status ?? "Pending",
      priority: r.priority ?? "Medium",
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
  return NextResponse.json({ inserted, errors: errorCount, errorDetails: lastErrors });
}
