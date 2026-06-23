import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import {
  deleteSpreadsheetStash,
  SPREADSHEET_UPLOAD_CHUNK_SIZE,
  writeSpreadsheetStashChunk,
} from "@/lib/alexandra-spreadsheet-stash";

export const dynamic = "force-dynamic";

const postSchema = z.object({
  conversationId: z.string().uuid(),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().min(1),
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(SPREADSHEET_UPLOAD_CHUNK_SIZE),
  totalRows: z.number().int().positive().optional(),
  fileName: z.string().max(200).optional(),
  sheetName: z.string().max(200).optional(),
  contextMunicipality: z.string().max(200).optional(),
  columns: z.array(z.string()).optional(),
});

const deleteSchema = z.object({
  conversationId: z.string().uuid(),
});

async function assertConversationOwner(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<NextResponse | null> {
  const { data: conv, error } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!conv) {
    return NextResponse.json({ error: "Η συνομιλία δεν βρέθηκε" }, { status: 404 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile, supabase } = crm;
  if (!user || !profile || !supabase) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile.role, "manager")) {
    return forbidden();
  }

  let body: z.infer<typeof postSchema>;
  try {
    const raw = await request.json();
    const parsed = postSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
  }

  const ownerErr = await assertConversationOwner(supabase, user.id, body.conversationId);
  if (ownerErr) return ownerErr;

  if (body.chunkIndex >= body.totalChunks) {
    return NextResponse.json({ error: "Άκυρος δείκτης τμήματος" }, { status: 400 });
  }

  try {
    await writeSpreadsheetStashChunk(user.id, body.conversationId, body.chunkIndex, body.totalChunks, body.rows, {
      fileName: body.fileName,
      sheetName: body.sheetName,
      contextMunicipality: body.contextMunicipality,
      columns: body.columns,
      totalRows: body.totalRows,
    });
    return NextResponse.json({
      ok: true,
      chunkIndex: body.chunkIndex,
      totalChunks: body.totalChunks,
      received: body.chunkIndex + 1,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Σφάλμα αποθήκευσης" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const crm = await checkCRMAccess();
  if (!crm.allowed) return crm.response;
  const { user, profile, supabase } = crm;
  if (!user || !profile || !supabase) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile.role, "manager")) {
    return forbidden();
  }

  let body: z.infer<typeof deleteSchema>;
  try {
    const raw = await request.json();
    const parsed = deleteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ error: "Άκυρο αίτημα" }, { status: 400 });
  }

  const ownerErr = await assertConversationOwner(supabase, user.id, body.conversationId);
  if (ownerErr) return ownerErr;

  await deleteSpreadsheetStash(user.id, body.conversationId);
  return NextResponse.json({ ok: true });
}
