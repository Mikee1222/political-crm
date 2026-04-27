/**
 * WhatsApp Cloud API (Meta) — εξερχόμενα μηνύματα.
 */

const API_VER = "v21.0";

function baseUrl() {
  const id = process.env.WHATSAPP_PHONE_ID?.trim();
  if (!id) throw new Error("Λείπει WHATSAPP_PHONE_ID");
  return `https://graph.facebook.com/${API_VER}/${id}`;
}

function authHeaders(): HeadersInit {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  if (!token) throw new Error("Λείπει WHATSAPP_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/** E.164 χωρίς + π.χ. 3069... */
export function normalizeWhatsAppPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length < 10) return "";
  if (d.startsWith("30")) return d;
  if (d.startsWith("0")) return `30${d.slice(1)}`;
  return `30${d}`;
}

export type WhatsAppSendResult =
  | { ok: true; messageId: string | null; raw: unknown }
  | { ok: false; error: string; status?: number; raw?: unknown };

export async function sendWhatsAppMessage(phone: string, message: string): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppPhone(phone);
  if (!to) return { ok: false, error: "Άκυρο τηλέφωνο" };
  const url = `${baseUrl()}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message.slice(0, 4096) },
    }),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error: String((raw as { error?: { message?: string } }).error?.message ?? res.statusText),
      status: res.status,
      raw,
    };
  }
  const mid = (raw as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? null;
  return { ok: true, messageId: mid, raw };
}

/**
 * Αποστολή εγκεκριμένου προτύπου (template).
 * @param params — τιμές μεταβλητών body (κειμενικές) με τη σειρά του προτύπου
 */
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[],
): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppPhone(phone);
  if (!to) return { ok: false, error: "Άκυρο τηλέφωνο" };
  const url = `${baseUrl()}/messages`;
  const bodyParams =
    params.length > 0
      ? {
          type: "body" as const,
          parameters: params.map((t) => ({ type: "text" as const, text: t.slice(0, 1024) })),
        }
      : undefined;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: "el" },
        ...(bodyParams ? { components: [bodyParams] } : {}),
      },
    }),
  });
  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return {
      ok: false,
      error: String((raw as { error?: { message?: string } }).error?.message ?? res.statusText),
      status: res.status,
      raw,
    };
  }
  const mid = (raw as { messages?: Array<{ id?: string }> }).messages?.[0]?.id ?? null;
  return { ok: true, messageId: mid, raw };
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_ID?.trim(),
  );
}
