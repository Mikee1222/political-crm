import { createServiceClient } from "@/lib/supabase/admin";

export type ActivityAction =
  | "contact_created"
  | "contact_updated"
  | "contact_note_added"
  | "call_made"
  | "request_created"
  | "request_updated"
  | "request_note_added"
  | "campaign_started";

export type ActivityEntityType = "contact" | "request" | "campaign" | "task";

export async function logActivity(params: {
  userId: string | null;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  entityName: string;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const admin = createServiceClient();
    const { error } = await admin.from("activity_log").insert({
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      entity_name: params.entityName,
      details: params.details ?? null,
    });
    if (error) {
      console.error("[activity_log]", error.message);
    }
  } catch (e) {
    console.error("[activity_log]", e);
  }
}
