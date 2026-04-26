import type { PdfData } from "./pdf-types";

export function getPdfParse(): (b: Buffer) => Promise<PdfData> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  return require("pdf-parse") as (b: Buffer) => Promise<PdfData>;
}

export async function extractTextFromPdfBuffer(buf: Buffer): Promise<{ text: string; pages: number }> {
  const parse = getPdfParse();
  const d = await parse(buf);
  return { text: d.text ?? "", pages: d.numpages ?? 0 };
}
