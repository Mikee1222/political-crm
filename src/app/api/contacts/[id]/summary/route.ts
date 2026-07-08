import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { hasMinRole } from "@/lib/roles";
import { hasPermissionFlexible } from "@/lib/permission-check";
import { nextJsonError } from "@/lib/api-resilience";

export const dynamic = "force-dynamic";

type ContactSummaryRpc = {
  contact: Record<string, unknown> | null;
  groups: Array<Record<string, unknown>>;
  recent_notes: Array<Record<string, unknown>>;
  open_requests_count: number;
  related_persons_count: number;
};

function omitAiSummaryFields<T extends Record<string, unknown>>(row: T): T {
  const rest = { ...row };
  delete rest.ai_summary;
  delete rest.ai_summary_updated_at;
  return rest;
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, profile, supabase } = crm;
    const role = profile?.role ?? "caller";
    const canViewAiSummary = await hasPermissionFlexible(
      user.id,
      "ai_summary_view",
      hasMinRole(role, "manager", profile?.access_tier),
    );

    const { data, error } = await supabase.rpc("get_contact_summary", { p_contact_id: params.id });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const summary = (data ?? null) as ContactSummaryRpc | null;
    if (!summary?.contact) {
      return NextResponse.json({ error: "Δεν βρέθηκε επαφή" }, { status: 404 });
    }

    const groups = Array.isArray(summary.groups) ? summary.groups : [];
    const rawContact = summary.contact ?? null;
    const contact = rawContact
      ? canViewAiSummary
        ? rawContact
        : omitAiSummaryFields(rawContact)
      : null;
    const recentNotes = (Array.isArray(summary.recent_notes) ? summary.recent_notes : []).map((note) => {
      const author = typeof note.author_name === "string" ? note.author_name.trim() : "";
      return {
        ...note,
        author_name: author || null,
        author_full_name: author || "—",
      };
    });

    return NextResponse.json({
      contact: contact
        ? {
            ...contact,
            all_groups: groups,
            contact_groups: groups[0] ?? null,
            group_id: (contact.group_id as string | null | undefined) ?? null,
          }
        : null,
      groups,
      recent_notes: recentNotes,
      open_requests_count:
        typeof summary.open_requests_count === "number" ? summary.open_requests_count : 0,
      related_persons_count:
        typeof summary.related_persons_count === "number" ? summary.related_persons_count : 0,
    });
  } catch (e) {
    console.error("[api/contacts/id/summary GET]", e);
    return nextJsonError();
  }
}
