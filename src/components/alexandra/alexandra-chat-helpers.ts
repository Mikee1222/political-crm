import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import { hasMinRole, type Role } from "@/lib/roles";
import type { ActionPayload } from "@/lib/ai-assistant-actions";

import type { LucideIcon } from "lucide-react";
import { BarChart2, Bell, MapPin, Sparkles, UserSearch, ListTodo } from "lucide-react";

export const SUGGESTED_CHIPS: { text: string; icon: LucideIcon }[] = [
  { text: "Τι έχω για σήμερα;", icon: Sparkles },
  { text: "Ποιοι γιορτάζουν αυτή την εβδομάδα;", icon: BarChart2 },
  { text: "Δείξε μου τους αναποφάσιστους", icon: UserSearch },
  { text: "Ποια αιτήματα είναι εκκρεμή;", icon: ListTodo },
  { text: "Βρες μου επαφές από το Αγρίνιο", icon: MapPin },
  { text: "Τι tasks έχω;", icon: Bell },
];

export const SUGGESTED: string[] = SUGGESTED_CHIPS.map((c) => c.text);

export type FindRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  call_status: string | null;
};

export type StoredAssistantAction = {
  parsed?: ActionPayload | null;
  findResults?: FindRow[];
  /** /contacts?… for «Δείξε στις Επαφές» */
  filterUrl?: string;
  toolsExecuted?: string[];
  executed?: boolean;
  startCallMeta?: { name: string; phone: string } | null;
} | null;

export type StreamMeta = {
  executed: string[];
  confirmCall?: { contact_id: string; name: string; phone: string };
  bulkProgress?: { current: number; total: number };
};

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contextLabel?: string;
  pendingAction?: ActionPayload | null;
  executed?: boolean;
  findResults?: FindRow[] | null;
  filterUrl?: string | null;
  startCallMeta?: { name: string; phone: string } | null;
  toolsExecutedFromDb?: string[] | null;
  isStreaming?: boolean;
  streamMeta?: StreamMeta | null;
};

export type RowConv = {
  id: string;
  title: string;
  updated_at: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
};
export type MsgWithT = Msg & { _createdAt?: string };

export function greekToolLabel(t: string) {
  const m: Record<string, string> = {
    find_contacts: "Αναζήτηση επαφών",
    get_saved_filters: "Αποθηκευμένα φίλτρα",
    update_contact: "Ενημέρωση επαφής",
    edit_contact: "Επεξεργασία επαφής",
    create_contact: "Νέα επαφή",
    create_request: "Αίτημα",
    add_note: "Σημείωση",
    get_contact_details: "Λεπτομέρειες",
    get_stats: "Στατιστικά",
    start_call: "Κλήση",
    add_task: "Εργασία",
    update_contact_status: "Κατάσταση κλήσης",
    import_csv_data: "Εισαγωγή CSV",
    bulk_create_contacts: "Μαζική δημιουργία επαφών",
    search_contacts_advanced: "Προχωρημένη αναζήτηση",
    get_all_contacts: "Λίστα επαφών (ανάλυση)",
    bulk_update_contacts: "Μαζική ενημέρωση",
    bulk_delete_contacts: "Μαζική διαγραφή",
    smart_excel_import: "Έξυπνο import Excel",
    read_pdf: "PDF",
    write_letter: "Επιστολή",
    save_memory: "Μνήμη",
    get_memories: "Φόρτωση μνημών",
    schedule_reminder: "Υπενθύμιση",
    add_calendar_event: "Ημερολόγιο (νέο event)",
    get_calendar_events: "Ημερολόγιο (πρόγραμμα)",
    analyze_contacts: "Ανάλυση επαφών",
    generate_letter: "Επιστολή (επίσημη)",
    generate_press_release: "Ανακοίνωση τύπου",
    generate_social_post: "Social post",
    bulk_send_nameday_wishes: "Καμπάνια ευχών (εορτές)",
    find_contacts_not_called: "Χωρίς κλήση",
    analyze_document: "Ανάλυση εγγράφου",
    morning_briefing: "Ημερήσια ενημέρωση",
  };
  return m[t] ?? t;
}

export function initialsName(first: string, last: string) {
  return `${(first?.[0] ?? "?").toUpperCase()}${(last?.[0] ?? "?").toUpperCase()}`;
}

export function canExecuteAction(role: Role | null | undefined, a: ActionPayload) {
  if (a.action === "find_contacts") return false;
  if (a.action === "update_status") return true;
  return hasMinRole(role, "manager");
}

export function canConfirmStartCall(role: Role | null | undefined, a: ActionPayload) {
  return a.action === "start_call" && hasMinRole(role, "manager");
}

export function canConfirmCreate(role: Role | null | undefined, a: ActionPayload) {
  return a.action === "create_contact" && hasMinRole(role, "manager");
}

export function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function fmtRelativeTime(iso: string) {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: el });
  } catch {
    return "";
  }
}

export function mapDbToMsg(row: {
  id: string;
  role: string;
  content: string;
  action: unknown;
  context_label: string | null;
  created_at: string;
}): Msg & { _createdAt: string } {
  if (row.role === "user") {
    return {
      id: row.id,
      role: "user" as const,
      content: row.content,
      _createdAt: row.created_at,
    };
  }
  const st = row.action as StoredAssistantAction;
  return {
    id: row.id,
    role: "assistant" as const,
    content: row.content,
    contextLabel: row.context_label ?? undefined,
    pendingAction: st?.parsed ?? null,
    executed: st?.executed,
    findResults: st?.findResults,
    filterUrl: st?.filterUrl,
    startCallMeta: st?.startCallMeta,
    toolsExecutedFromDb: st?.toolsExecuted ?? null,
    _createdAt: row.created_at,
  };
}
