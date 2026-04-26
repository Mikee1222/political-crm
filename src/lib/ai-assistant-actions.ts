import { z } from "zod";

const findFilters = z
  .object({
    call_status: z.string().optional(),
    area: z.string().optional(),
    municipality: z.string().optional(),
    priority: z.string().optional(),
  })
  .optional();

const createContact = z.object({
  action: z.literal("create_contact"),
  data: z.record(z.string(), z.any()),
});

const updateStatus = z.object({
  action: z.literal("update_status"),
  contact_id: z.string().uuid(),
  status: z.string().min(1),
});

const addTask = z.object({
  action: z.literal("add_task"),
  contact_id: z.string().uuid(),
  title: z.string().min(1),
  due_date: z.string().nullable().optional(),
});

const completeTask = z.object({
  action: z.literal("complete_task"),
  task_id: z.string().uuid(),
});

const createRequest = z.object({
  action: z.literal("create_request"),
  contact_id: z.string().uuid(),
  title: z.string().min(1),
  category: z.string().optional(),
  description: z.string().nullable().optional(),
});

const updateRequest = z.object({
  action: z.literal("update_request"),
  request_id: z.string().uuid(),
  status: z.string().min(1),
});

const startCall = z.object({
  action: z.literal("start_call"),
  contact_id: z.string().uuid(),
});

const startCampaignCalls = z.object({
  action: z.literal("start_campaign_calls"),
  filter: z
    .object({
      call_status: z.string().optional(),
      area: z.string().optional(),
    })
    .optional(),
});

const startCallsAlias = z.object({
  action: z.literal("start_calls"),
  filter: z
    .object({
      call_status: z.string().optional(),
      area: z.string().optional(),
    })
    .optional(),
});

const addNote = z.object({
  action: z.literal("add_note"),
  contact_id: z.string().uuid(),
  note: z.string().min(1),
});

const findContacts = z.object({
  action: z.literal("find_contacts"),
  filters: findFilters,
});

export const actionPayloadSchema = z.discriminatedUnion("action", [
  createContact,
  updateStatus,
  addTask,
  completeTask,
  createRequest,
  updateRequest,
  startCall,
  startCampaignCalls,
  startCallsAlias,
  addNote,
  findContacts,
]);

export type ActionPayload = z.infer<typeof actionPayloadSchema>;

/** Extracts first balanced { ... } from position (for nested ACTION_JSON). */
function extractJsonObject(raw: string, fromIdx: number): string | null {
  const i = raw.indexOf("{", fromIdx);
  if (i < 0) return null;
  let depth = 0;
  for (let p = i; p < raw.length; p++) {
    const ch = raw[p];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return raw.slice(i, p + 1);
      }
    }
  }
  return null;
}

export function parseActionFromResponse(raw: string): { text: string; action: ActionPayload | null } {
  const idx = raw.lastIndexOf("ACTION_JSON:");
  if (idx < 0) {
    return { text: raw.trim(), action: null };
  }
  const before = raw.slice(0, idx).trim();
  const after = raw.slice(idx + "ACTION_JSON:".length);
  const jsonStr = extractJsonObject(after, 0);
  if (!jsonStr) {
    return { text: before || raw.trim(), action: null };
  }
  try {
    const parsed = JSON.parse(jsonStr) as unknown;
    const a = actionPayloadSchema.safeParse(parsed);
    if (a.success) {
      return {
        text: before || "Η ενέργεια ετοιμάστηκε. Ελέγξτε και πατήστε «Εκτέλεση» εάν σας ενδιαφέρει.",
        action: a.data,
      };
    }
  } catch {
    // ignore
  }
  return { text: before || raw.trim(), action: null };
}
