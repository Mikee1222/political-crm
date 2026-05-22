import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARGIN = 50;
const LINE_HEIGHT = 14;
const FONT_SIZE = 11;
const TITLE_SIZE = 16;

function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (next.length > maxChars) {
        if (line) lines.push(line);
        line = w.length > maxChars ? w.slice(0, maxChars) : w;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** Simple PDF (UTF-8 text; Latin/Greek via standard font — Greek may need WinAnsi subset). */
export async function buildAlexandraPdf(title: string, content: string, docType?: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  let y = height - MARGIN;

  const header = docType ? `${title} (${docType})` : title;
  page.drawText(header.slice(0, 200), {
    x: MARGIN,
    y: y - TITLE_SIZE,
    size: TITLE_SIZE,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.2),
    maxWidth: width - MARGIN * 2,
  });
  y -= TITLE_SIZE + 24;

  const body = content.trim() || "—";
  const lines = wrapLines(body, 85);
  for (const line of lines) {
    if (y < MARGIN + LINE_HEIGHT) {
      page = pdf.addPage([595.28, 841.89]);
      y = height - MARGIN;
    }
    const safe = line.replace(/[^\x20-\x7E\u0370-\u03FF]/g, "?");
    page.drawText(safe, {
      x: MARGIN,
      y: y - FONT_SIZE,
      size: FONT_SIZE,
      font,
      color: rgb(0.15, 0.15, 0.15),
      maxWidth: width - MARGIN * 2,
    });
    y -= LINE_HEIGHT;
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
