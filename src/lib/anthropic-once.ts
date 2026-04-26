import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

export async function anthropicComplete(
  system: string,
  user: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Λείπει ANTHROPIC_API_KEY στον διακομιστή" };
  try {
    const client = new Anthropic({ apiKey: key });
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user.slice(0, 80_000) }],
    });
    const block = msg.content[0];
    if (block.type !== "text") return { ok: false, error: "Άκυρο περιεχόμενο απάντησης" };
    return { ok: true, text: block.text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Σφάλμα Claude" };
  }
}
