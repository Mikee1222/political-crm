/** oEmbed may include <script>; we render the blockquote and load embed.js once. */
export function stripOembedScriptTags(html: string): string {
  return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "").trim();
}

let embedScriptPromise: Promise<void> | null = null;

/** Loads TikTok embed.js (once). Required for blockquote → player. */
export function loadTikTokEmbedScript(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (document.querySelector("script[data-tiktok-embed]")) {
    return Promise.resolve();
  }
  if (embedScriptPromise) return embedScriptPromise;
  embedScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.setAttribute("data-tiktok-embed", "true");
    s.src = "https://www.tiktok.com/embed.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("TikTok embed.js failed to load"));
    document.body.appendChild(s);
  });
  return embedScriptPromise;
}
