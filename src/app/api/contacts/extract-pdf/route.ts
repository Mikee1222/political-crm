import { NextResponse } from "next/server";
import { getSessionWithProfile, forbidden } from "@/lib/auth-helpers";
import { hasMinRole } from "@/lib/roles";
import { nextJsonError } from "@/lib/api-resilience";

export const runtime = "nodejs";
export const maxDuration = 30;

// pdf-parse is CommonJS only
type PdfData = { text: string; numpages: number };
const getPdf = (): ((b: Buffer) => Promise<PdfData>) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require("pdf-parse") as (b: Buffer) => Promise<PdfData>;
};

export async function POST(request: Request) {
  try {
  const { user, profile } = await getSessionWithProfile();
  if (!user) {
    return NextResponse.json({ error: "Μη εξουσιοδότηση" }, { status: 401 });
  }
  if (!hasMinRole(profile?.role, "manager")) {
    return forbidden();
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Χωρίς αρχείο" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const pdfParse = getPdf();
  const data = await pdfParse(buf);
  return NextResponse.json({ text: data.text ?? "", pages: data.numpages });
  } catch (e) {
    console.error("[api/contacts/extract-pdf]", e);
    return nextJsonError();
  }
}
