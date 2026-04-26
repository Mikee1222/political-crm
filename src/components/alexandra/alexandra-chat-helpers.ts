import { hasMinRole, type Role } from "@/lib/roles";
import type { ActionPayload } from "@/lib/ai-assistant-actions";

export const SUGGESTED: string[] = [
  "Τι έχω για σήμερα;",
  "Ποιοι γιορτάζουν αυτή την εβδομάδα;",
  "Δείξε μου τους αναποφάσιστους",
  "Ποια αιτήματα είναι εκκρεμή;",
  "Βρες μου επαφές από το Αγρίνιο",
  "Τι tasks έχω;",
];

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
  startCallMeta?: { name: string; phone: string } | null;
  toolsExecutedFromDb?: string[] | null;
  isStreaming?: boolean;
  streamMeta?: StreamMeta | null;
};

export type RowConv = { id: string; title: string; updated_at: string };
export type MsgWithT = Msg & { _createdAt?: string };

export function greekToolLabel(t: string) {
  const m: Record<string, string> = {
    find_contacts: "Αναζήτηση επαφών",
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
    startCallMeta: st?.startCallMeta,
    toolsExecutedFromDb: st?.toolsExecuted ?? null,
    _createdAt: row.created_at,
  };
}
