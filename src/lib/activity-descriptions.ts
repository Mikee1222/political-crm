import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import type { ActivityAction } from "@/lib/activity-log";

export function activityGreekLine(params: {
  action: ActivityAction;
  actorFirstName: string;
  entityName: string;
}): string {
  const { action, actorFirstName, entityName } = params;
  const a = actorFirstName || "Χρήστης";
  const e = entityName || "—";
  switch (action) {
    case "contact_created":
      return `Ο/Η ${a} δημιούργησε επαφή ${e}`;
    case "contact_updated":
      return `Ο/Η ${a} ενημέρωσε επαφή ${e}`;
    case "contact_note_added":
      return `Ο/Η ${a} πρόσθεσε σημείωση — ${e}`;
    case "call_made":
      if (actorFirstName && actorFirstName !== "Χρήστης") {
        return `Ο/Η ${a} ξεκίνησε κλήση — ${e}`;
      }
      return `Κλήση καταγράφηκε — ${e}`;
    case "request_created":
      return `Ο/Η ${a} δημιούργησε αίτημα «${e}»`;
    case "request_updated":
      return `Ο/Η ${a} ενημέρωσε αίτημα «${e}»`;
    case "task_updated":
      return `Ο/Η ${a} ενημέρωσε εργασία «${e}»`;
    case "campaign_started":
      return `Η καμπάνια «${e}» ξεκίνησε (καταχώρηση: ${a})`;
    default:
      return e;
  }
}

export function formatTimeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: el });
  } catch {
    return "";
  }
}

export function firstNameFromFull(full: string | null | undefined): string {
  if (!full?.trim()) return "Χρήστης";
  return full.trim().split(/\s+/)[0] ?? "Χρήστης";
}
