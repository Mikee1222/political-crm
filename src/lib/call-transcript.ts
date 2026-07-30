/** One turn in a Retell-style call transcript (`agent:` / `user:` markers). */
export type CallTranscriptTurn = {
  role: "agent" | "user" | "other";
  text: string;
};

const ROLE_MARKER = /\b(agent|user)\s*:/gi;

/**
 * Split a flat transcript string into turns.
 * Handles both newline-separated and same-line `"agent: … user: …"` forms.
 * When no markers are present, returns a single `other` turn with the trimmed text.
 */
export function parseCallTranscript(raw: string | null | undefined): CallTranscriptTurn[] {
  if (raw == null) return [];
  const text = String(raw).trim();
  if (!text) return [];

  const markers: Array<{ role: "agent" | "user"; markerStart: number; contentStart: number }> = [];
  ROLE_MARKER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROLE_MARKER.exec(text)) !== null) {
    const role = m[1]!.toLowerCase() as "agent" | "user";
    markers.push({
      role,
      markerStart: m.index,
      contentStart: m.index + m[0].length,
    });
  }

  if (markers.length === 0) {
    return [{ role: "other", text }];
  }

  const turns: CallTranscriptTurn[] = [];
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i]!;
    const contentEnd = i + 1 < markers.length ? markers[i + 1]!.markerStart : text.length;
    const body = text.slice(cur.contentStart, contentEnd).trim();
    if (body) turns.push({ role: cur.role, text: body });
  }

  return turns.length ? turns : [{ role: "other", text }];
}

export function hasCallTranscript(raw: string | null | undefined): boolean {
  return Boolean(raw && String(raw).trim());
}
