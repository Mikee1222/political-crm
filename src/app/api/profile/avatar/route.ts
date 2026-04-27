import { checkCRMAccess } from "@/lib/crm-api-access";
import { NextRequest, NextResponse } from "next/server";
import { nextJsonError } from "@/lib/api-resilience";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;

function extForType(ct: string): "jpg" | "png" | "webp" | "gif" {
  if (ct === "image/png") return "png";
  if (ct === "image/webp") return "webp";
  if (ct === "image/gif") return "gif";
  return "jpg";
}

export async function POST(request: NextRequest) {
  try {
    const crm = await checkCRMAccess();
    if (!crm.allowed) return crm.response;
    const { user, supabase } = crm;
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      return NextResponse.json({ error: "Χωρίς αρχείο" }, { status: 400 });
    }
    const f = file as File;
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: "Το αρχείο πρέπει να είναι ≤ 2MB" }, { status: 400 });
    }
    if (!f.type || !f.type.startsWith("image/")) {
      return NextResponse.json({ error: "Μη έγκυρος τύπος (μόνο εικόνα)" }, { status: 400 });
    }
    const ab = await f.arrayBuffer();
    const ext = extForType(f.type);
    const path = `${user.id}/avatar.${ext}`;
    const { error: uErr } = await supabase.storage.from("avatars").upload(path, ab, {
      upsert: true,
      contentType: f.type,
    });
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 400 });
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: pErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 400 });
    }
    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    console.error("[api/profile/avatar]", e);
    return nextJsonError();
  }
}
