/**
 * Custom HTTP server: Next.js App Router + Retell custom LLM WebSocket on `/api/retell/llm/:call_id`.
 * @see https://docs.retellai.com/api-references/llm-websocket
 *
 * Set agent **Custom LLM WebSocket URL** to `wss://<your-host>/api/retell/llm` (Retell appends `/<call_id>`).
 * Note: Vercel serverless does not support this WebSocket; use a Node host or ngrok for dev.
 */
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { WebSocketServer } from "ws";
import { attachRetellLlmSocket } from "./src/lib/retell-llm-ws/retell-llm-socket";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME ?? "localhost";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev, hostname, port, dir: "." });
const handle = app.getRequestHandler();

const wss = new WebSocketServer({ noServer: true });

function extractCallId(pathname: string): string | null {
  const base = "/api/retell/llm";
  if (!pathname.startsWith(base)) return null;
  const rest = pathname.slice(base.length).replace(/^\/+|\/+$/g, "");
  if (!rest) return null;
  const first = rest.split("/")[0];
  return first && first.length > 0 ? first : null;
}

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      const parsed = parse(req.url ?? "", true);
      const pathname = parsed.pathname ?? "";
      void handle(req, res, parsed);
    } catch (e) {
      console.error("[server] request handler", e);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const pathname = parse(request.url ?? "", true).pathname ?? "";
    const callId = extractCallId(pathname);
    if (callId) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        attachRetellLlmSocket(ws, callId);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port} (WebSocket: /api/retell/llm/:call_id)`);
  });
});
