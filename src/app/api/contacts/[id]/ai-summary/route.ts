import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { anthropicComplete } from "@/lib/anthropic-once";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const { data: c, error } = await supabase
      .from("contacts")
      .select("id, ai_summary, ai_summary_updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      console.warn("[ai-summary GET]", error.message);
      return NextResponse.json({ summary: null, updated_at: null });
    }
    if (!c) {
      return NextResponse.json({ summary: null, updated_at: null });
    }
    return NextResponse.json({
      summary: (c as { ai_summary?: string | null }).ai_summary ?? null,
      updated_at: (c as { ai_summary_updated_at?: string | null }).ai_summary_updated_at ?? null,
    });
  } catch (e) {
    console.error("[ai-summary GET]", e);
    return NextResponse.json({ summary: null, updated_at: null });
  }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) return forbidden();

    const { data: contact, error: ce } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
    if (ce || !contact) {
      return NextResponse.json({ error: "Άγνωστη επαφή" }, { status: 404 });
    }

    const { data: calls } = await supabase
      .from("calls")
      .select("called_at, outcome, notes, duration_seconds")
      .eq("contact_id", id)
      .order("called_at", { ascending: false })
      .limit(30);
    const { data: requests } = await supabase
      .from("requests")
      .select("title, status, description, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: tasks } = await supabase
      .from("tasks")
      .select("title, due_date, completed, description")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    const { data: notes } = await supabase
      .from("contact_notes")
      .select("content, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(25);

    const pack = {
      contact,
      calls: calls ?? [],
      requests: requests ?? [],
      tasks: tasks ?? [],
      notes: notes ?? [],
    };
    const userContent = `Δεδομένα επαφής (JSON):\n${JSON.stringify(pack, null, 0)}`;

    const out = await anthropicComplete(
      "Είσαι βοηθός για βουλευτή. Απαντάς μόνο στα ελληνικά, δύο έως τρεις πλήρεις προτάσεις, χωρίς εισαγωγή τίτλου.",
      `Γράψε σύντομη σύνοψη 2-3 προτάσεων για αυτή την επαφή για έναν βουλευτή που πρόκειται να τηλεφωνήσει.\n\n${userContent}`,
    );
    if (!out.ok) {
      return NextResponse.json({ error: out.error }, { status: 503 });
    }
    const summary = out.text.trim();
    const now = new Date().toISOString();
    const { error: up } = await supabase
      .from("contacts")
      .update({ ai_summary: summary, ai_summary_updated_at: now })
      .eq("id", id);
    if (up) {
      return NextResponse.json({ error: up.message }, { status: 400 });
    }
    return NextResponse.json({ summary, updated_at: now });
  } catch (e) {
    console.error("[ai-summary POST]", e);
    return nextJsonError();
  }
}
