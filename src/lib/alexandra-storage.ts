import { createServiceClient } from "@/lib/supabase/admin";
import { sanitizeStorageFilename } from "@/lib/contact-documents";

const BUCKET = "documents";
const SIGNED_TTL_SEC = 60 * 60 * 24;

export async function storeAlexandraExport(
  userId: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ path: string; download_url: string }> {
  const safe = sanitizeStorageFilename(filename).slice(0, 180) || "export";
  const path = `alexandra/${userId}/${Date.now()}-${safe}`;
  const admin = createServiceClient();
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (upErr) {
    throw new Error(upErr.message);
  }
  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL_SEC);
  if (signErr || !signed?.signedUrl) {
    throw new Error(signErr?.message ?? "Δεν δημιουργήθηκε σύνδεσμος λήψης");
  }
  return { path, download_url: signed.signedUrl };
}
