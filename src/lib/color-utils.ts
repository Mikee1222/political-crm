/** Normalize #RGB / #RRGGBB to six-digit hex without hash. */
function expandHex(hex: string): string | null {
  const h = hex.replace(/^#/, "").trim();
  if (!/^[0-9a-fA-F]{3}$/.test(h) && !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  if (h.length === 3) {
    return h
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase();
  }
  return h.toLowerCase();
}

/** WCAG-style relative luminance for sRGB hex. */
function relativeLuminance(hex6: string): number {
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(hex6.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** Pick dark or light text for a solid background hex. */
export function getContrastColor(hexBg: string): string {
  const hex6 = expandHex(hexBg);
  if (!hex6) return "#1F2937";
  return relativeLuminance(hex6) > 0.45 ? "#1F2937" : "#F9FAFB";
}

/** Simple luminance check for dynamic chip/badge backgrounds. */
export function getChipTextColor(bgHex: string): string {
  const hex6 = expandHex(bgHex);
  if (!hex6) return "#1a1a1a";
  const r = parseInt(hex6.slice(0, 2), 16);
  const g = parseInt(hex6.slice(2, 4), 16);
  const b = parseInt(hex6.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
}

/** Shared class for group/category pills (pairs with getGroupChipStyle). */
export const GROUP_CHIP_CLASS = "group-chip";

/** Inline styles for group/tag pills with a custom hex background. */
export function getGroupChipStyle(hex?: string | null): {
  backgroundColor: string;
  ["--group-chip-text"]: string;
} {
  const backgroundColor = hex?.trim() || "#003476";
  return {
    backgroundColor,
    "--group-chip-text": getChipTextColor(backgroundColor),
  };
}

export function normalizeHexColor(input: string): string | null {
  const hex6 = expandHex(input);
  return hex6 ? `#${hex6.toUpperCase()}` : null;
}
