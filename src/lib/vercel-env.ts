/**
 * Update / create Vercel project environment variables via the Vercel REST API.
 * Requires VERCEL_TOKEN + VERCEL_PROJECT_ID (optional VERCEL_TEAM_ID for team projects).
 */

export type VercelEnvTarget = "production" | "preview" | "development";

type VercelEnvRow = {
  id: string;
  key: string;
  target?: VercelEnvTarget[] | string;
};

function vercelAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function teamQuery(teamId: string | undefined): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
}

export function getVercelEnvConfig():
  | { ok: true; token: string; projectId: string; teamId?: string }
  | { ok: false; error: string } {
  const token = process.env.VERCEL_TOKEN?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!token || !projectId) {
    return {
      ok: false,
      error:
        "Λείπουν VERCEL_TOKEN ή VERCEL_PROJECT_ID — δεν μπορούν να ενημερωθούν οι μεταβλητές στο Vercel.",
    };
  }
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;
  return { ok: true, token, projectId, teamId };
}

export async function listVercelEnvVars(
  token: string,
  projectId: string,
  teamId?: string,
): Promise<VercelEnvRow[]> {
  const url = `https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/env${teamQuery(teamId)}`;
  const res = await fetch(url, { headers: vercelAuthHeaders(token), cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as {
    envs?: VercelEnvRow[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `Vercel list env failed (${res.status})`);
  }
  return body.envs ?? [];
}

/**
 * Upsert a single env var for production/preview/development.
 * Finds by key, PATCHes if present, otherwise POSTs create.
 */
export async function upsertVercelEnvVar(
  token: string,
  projectId: string,
  key: string,
  value: string,
  teamId?: string,
): Promise<void> {
  const targets: VercelEnvTarget[] = ["production", "preview", "development"];
  const existing = await listVercelEnvVars(token, projectId, teamId);
  const match = existing.find((e) => e.key === key);

  if (match?.id) {
    const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env/${encodeURIComponent(match.id)}${teamQuery(teamId)}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: vercelAuthHeaders(token),
      body: JSON.stringify({ value, target: targets }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      throw new Error(body.error?.message ?? `Vercel PATCH env failed (${res.status})`);
    }
    return;
  }

  const createUrl = `https://api.vercel.com/v10/projects/${encodeURIComponent(projectId)}/env${teamQuery(teamId)}`;
  const res = await fetch(createUrl, {
    method: "POST",
    headers: vercelAuthHeaders(token),
    body: JSON.stringify({
      key,
      value,
      type: "encrypted",
      target: targets,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `Vercel create env failed (${res.status})`);
  }
}
