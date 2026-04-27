import { NextResponse } from "next/server";

/**
 * Retell **Custom LLM** uses a **WebSocket** to `wss://<host>/api/retell/llm/<call_id>`, not this HTTP route.
 * The upgrade is handled by the root `server.ts` (`npm run dev` / `npm start`). Configure the agent with
 * base URL `wss://<host>/api/retell/llm` (Retell appends `/<call_id>`).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      error:
        "Custom LLM is WebSocket-only. Use wss://<host>/api/retell/llm/<call_id> via the custom server (see server.ts).",
    },
    { status: 426 },
  );
}

export function POST() {
  return NextResponse.json(
    {
      error:
        "Custom LLM is WebSocket-only. Use wss://<host>/api/retell/llm/<call_id> via the custom server (see server.ts).",
    },
    { status: 426 },
  );
}
