import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { anthropicComplete } from "@/lib/anthropic-once";
import { formatDateAthens } from "@/lib/date-format";

export const dynamic = "force-dynamic";

const SELECT_WITH_CONTACT =
  "id, request_code, title, description, category, status, priority, created_at, sla_due_date, contact_id, contacts!contact_id(first_name,last_name,phone,address,area,municipality,political_stance,call_status,occupation,age,contact_groups(name))";

const SELECT_FALLBACK =
  "id, request_code, title, description, category, status, priority, created_at, sla_due_date, contact_id, contacts!contact_id(first_name,last_name,phone,address,area,municipality,political_stance,call_status,occupation,age)";

type ContactRow = {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  address?: string | null;
  area?: string | null;
  municipality?: string | null;
  political_stance?: string | null;
  call_status?: string | null;
  occupation?: string | null;
  age?: number | null;
  contact_groups?: { name?: string } | { name?: string }[] | null;
};

function resolveContact(contacts: unknown): ContactRow | null {
  if (!contacts) return null;
  if (Array.isArray(contacts)) return (contacts[0] as ContactRow) ?? null;
  return contacts as ContactRow;
}

function resolveGroupName(contact: ContactRow | null): string {
  const groups = contact?.contact_groups;
  if (Array.isArray(groups)) return groups[0]?.name ?? "Καμία";
  if (groups && typeof groups === "object" && "name" in groups) {
    return (groups as { name?: string }).name ?? "Καμία";
  }
  return "Καμία";
}

export async function POST(req: NextRequest) {
  try {
    console.log("[ai-summary] API key exists:", !!process.env.ANTHROPIC_API_KEY);

    const crm = await checkCRMAccess(req);
    if (!crm.allowed) return crm.response;
    const { profile, supabase } = crm;
    if (!hasMinRole(profile?.role, "manager")) {
      return forbidden();
    }

    const body = (await req.json()) as { requestId?: string };
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (!requestId) {
      return NextResponse.json({ error: "Απαιτείται requestId" }, { status: 400 });
    }

    let { data: requestRow, error: reqErr } = await supabase
      .from("requests")
      .select(SELECT_WITH_CONTACT)
      .eq("id", requestId)
      .single();

    if (reqErr?.message.includes("contact_groups")) {
      const retry = await supabase.from("requests").select(SELECT_FALLBACK).eq("id", requestId).single();
      requestRow = retry.data as typeof requestRow;
      reqErr = retry.error;
    }

    if (reqErr || !requestRow) {
      console.error("[ai-summary] request fetch failed:", reqErr);
      return NextResponse.json(
        { error: reqErr?.message ?? "Δεν βρέθηκε το αίτημα" },
        { status: 404 },
      );
    }

    const { data: notes, error: notesErr } = await supabase
      .from("request_notes")
      .select("content, created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: true })
      .limit(10);

    if (notesErr) {
      console.error("[ai-summary] notes fetch failed:", notesErr);
    }

    const row = requestRow as {
      request_code?: string | null;
      title?: string | null;
      description?: string | null;
      category?: string | null;
      status?: string | null;
      priority?: string | null;
      created_at?: string | null;
      sla_due_date?: string | null;
      contacts?: unknown;
    };

    const contact = resolveContact(row.contacts);
    const contactName = contact
      ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Άγνωστος"
      : "Άγνωστος";
    const groupName = resolveGroupName(contact);

    const notesText =
      notes && notes.length > 0
        ? notes
            .map((n) => {
              const c = n as { content?: string; created_at?: string };
              const d = c.created_at ? formatDateAthens(c.created_at) : "—";
              return `- ${c.content ?? ""} (${d})`;
            })
            .join("\n")
        : "Δεν υπάρχουν σημειώσεις.";

    const createdLabel = row.created_at ? formatDateAthens(row.created_at) : "—";

    const prompt = `Είσαι βοηθός πολιτικού γραφείου. Δώσε μια ΟΛΟΚΛΗΡΩΜΕΝΗ σύνοψη (4-6 προτάσεις) στα ελληνικά για το παρακάτω αίτημα. ΣΗΜΑΝΤΙΚΟ: Να ολοκληρώνεις πάντα τις προτάσεις σου.

ΑΙΤΗΜΑ: ${row.request_code ?? "—"} — ${row.title ?? "—"}
ΚΑΤΗΓΟΡΙΑ: ${row.category ?? "—"}
ΚΑΤΑΣΤΑΣΗ: ${row.status ?? "—"}
ΠΡΟΤΕΡΑΙΟΤΗΤΑ: ${row.priority ?? "—"}
ΠΕΡΙΓΡΑΦΗ: ${row.description ?? "Χωρίς περιγραφή"}
ΗΜΕΡΟΜΗΝΙΑ: ${createdLabel}
SLA: ${row.sla_due_date ?? "—"}

ΠΟΛΙΤΗΣ: ${contactName}
ΤΗΛΕΦΩΝΟ: ${contact?.phone ?? "—"}
ΠΕΡΙΟΧΗ: ${contact?.municipality ?? contact?.area ?? "Άγνωστη"}
ΗΛΙΚΙΑ: ${contact?.age ?? "Άγνωστη"}
ΕΠΑΓΓΕΛΜΑ: ${contact?.occupation ?? "Άγνωστο"}
ΠΟΛΙΤΙΚΗ ΣΤΑΣΗ: ${contact?.political_stance ?? "—"}
ΚΑΤΑΣΤΑΣΗ ΚΛΗΣΗΣ: ${contact?.call_status ?? "—"}
ΟΜΑΔΑ: ${groupName}

ΙΣΤΟΡΙΚΟ ΣΗΜΕΙΩΣΕΩΝ:
${notesText}

Σύνοψη: Τι έχει γίνει, ποιος είναι ο πολίτης και ποια είναι η κατάσταση του αιτήματος;`;

    const out = await anthropicComplete(
      "Είσαι βοηθός για βουλευτή. Απαντάς μόνο στα ελληνικά, 4-6 πλήρεις προτάσεις, χωρίς τίτλο ή markdown. Ολοκλήρωσε κάθε πρόταση.",
      prompt,
      { model: "claude-sonnet-4-5", maxTokens: 800 },
    );

    if (!out.ok) {
      console.error("[ai-summary] Anthropic failed:", out.error);
      return NextResponse.json(
        {
          error: out.error,
          summary: `Σφάλμα: ${out.error}`,
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ summary: out.text.trim() });
  } catch (err) {
    console.error("AI Summary error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message,
        summary: `Σφάλμα: ${message}`,
      },
      { status: 500 },
    );
  }
}
