import { NextRequest, NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";
import type { ContactGroupRow } from "@/lib/contact-groups";

export type { ContactGroupRow } from "@/lib/contact-groups";

export async function GET() {
  try {
    const { user, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    const { data, error } = await supabase
      .from("contact_groups")
      .select("id, name, color, year, description, created_at")
      .order("year", { ascending: false, nullsFirst: false })
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ groups: (data ?? []) as ContactGroupRow[] });
  } catch (e) {
    console.error("[api/groups GET]", e);
    return nextJsonError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, profile, supabase } = await getSessionWithProfile();
    if (!user) {
      return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
    }
    if (profile?.role !== "admin") {
      return forbidden();
    }
    const body = (await request.json()) as {
      name?: string;
      color?: string;
      year?: number | null;
      description?: string | null;
    };
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Υποχρεωτικό όνομα" }, { status: 400 });
    }
    const color = (body.color && String(body.color).trim()) || "#003476";
    const rawY = body.year as unknown;
    let year: number | null = null;
    if (rawY != null && String(rawY).trim() !== "") {
      const n = Number(rawY);
      if (Number.isFinite(n)) year = n;
    }
    const description = body.description != null && String(body.description).trim() ? String(body.description).trim() : null;
    const { data, error } = await supabase
      .from("contact_groups")
      .insert({
        name,
        color,
        year,
        description,
      })
      .select("id, name, color, year, description, created_at")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ group: data as ContactGroupRow });
  } catch (e) {
    console.error("[api/groups POST]", e);
    return nextJsonError();
  }
}
