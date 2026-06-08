import { formatDistanceToNow } from "date-fns";
import { el } from "date-fns/locale";
import { formatChatTime } from "@/lib/date-format";
import { hasMinRole } from "@/lib/roles";
import type { ActionPayload } from "@/lib/ai-assistant-actions";

import type { AlexandraPageContext } from "@/contexts/alexandra-page-context";
import type { LucideIcon } from "lucide-react";
import {
  BarChart2,
  Bell,
  Cake,
  FileText,
  ListTodo,
  MapPin,
  Megaphone,
  Phone,
  Sparkles,
  StickyNote,
  UserSearch,
} from "lucide-react";

export type EmptyStateSuggestion = {
  label: string;
  icon: LucideIcon;
  mode: "prefill" | "send";
  text: string;
};

/** Default empty-state cards when no page context */
export const EMPTY_STATE_SUGGESTIONS: EmptyStateSuggestion[] = [
  { label: "Πρωινή ενημέρωση", icon: Sparkles, mode: "send", text: "Δώσε μου πρωινή ενημέρωση" },
  { label: "Βρες επαφή", icon: UserSearch, mode: "prefill", text: "Βρες την επαφή " },
  { label: "Νέο αίτημα", icon: FileText, mode: "prefill", text: "Δημιούργησε αίτημα για " },
  { label: "Ποιος γιορτάζει;", icon: Cake, mode: "send", text: "Ποιος γιορτάζει σήμερα;" },
  { label: "Στατιστικά", icon: BarChart2, mode: "send", text: "Δείξε μου στατιστικά CRM" },
  { label: "Λίστα κλήσεων", icon: Phone, mode: "send", text: "Λίστα κλήσεων για σήμερα" },
];

function suggestion(label: string, prompt: string, icon: LucideIcon): EmptyStateSuggestion {
  const prefill = prompt.endsWith(" ");
  return { label, icon, mode: prefill ? "prefill" : "send", text: prompt };
}

/** Context-aware suggestion cards for Alexandra empty state */
export function getContextSuggestions(ctx: AlexandraPageContext | null | undefined): EmptyStateSuggestion[] {
  if (ctx?.type === "contact") {
    return [
      suggestion("Σύνοψη επαφής", "Δώσε μου σύνοψη αυτής της επαφής", Sparkles),
      suggestion("Προσθήκη σημείωσης", "Πρόσθεσε σημείωση: ", StickyNote),
      suggestion("Δες τα αιτήματά του", "Δείξε μου τα αιτήματα αυτής της επαφής", FileText),
      suggestion("Νέο αίτημα", "Δημιούργησε αίτημα για αυτή την επαφή: ", FileText),
    ];
  }
  if (ctx?.type === "request") {
    return [
      suggestion("Ανάλυση αιτήματος", "Ανάλυσε αυτό το αίτημα", Sparkles),
      suggestion("Ενημέρωση κατάστασης", "Άλλαξε την κατάσταση σε ", ListTodo),
      suggestion("Προσθήκη χειριστή", "Πρόσθεσε χειριστή: ", UserSearch),
      suggestion("Σημείωση", "Πρόσθεσε σημείωση στο αίτημα: ", StickyNote),
    ];
  }
  if (ctx?.type === "dashboard") {
    return [
      suggestion("Πρωινή ενημέρωση", "Δώσε μου πρωινή ενημέρωση", Sparkles),
      suggestion("Στατιστικά", "Δείξε μου τα στατιστικά του CRM", BarChart2),
      suggestion("Ποιος γιορτάζει;", "Ποιος γιορτάζει σήμερα;", Cake),
      suggestion("Λίστα κλήσεων", "Δείξε μου τη λίστα κλήσεων για σήμερα", Phone),
    ];
  }
  return EMPTY_STATE_SUGGESTIONS;
}

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

export const GREEK_TOOL_LABELS: Record<string, string> = {
  find_contacts: "Αναζήτηση επαφών",
  get_saved_filters: "Αποθηκευμένα φίλτρα",
  search_contacts_advanced: "Προχωρημένη αναζήτηση",
  get_all_contacts: "Λήψη επαφών",
  get_contact_details: "Στοιχεία επαφής",
  get_contact_summary: "Σύνοψη επαφής",
  find_contacts_not_called: "Μη κληθείσες επαφές",
  get_stats: "Στατιστικά CRM",
  export_contacts: "Εξαγωγή επαφών",
  create_contact: "Δημιουργία επαφής",
  update_contact: "Ενημέρωση επαφής",
  edit_contact: "Επεξεργασία επαφής",
  update_contact_status: "Ενημέρωση κατάστασης",
  add_note: "Προσθήκη σημείωσης",
  bulk_update_contacts: "Μαζική ενημέρωση",
  bulk_delete_contacts: "Μαζική διαγραφή",
  bulk_update_status: "Μαζική αλλαγή κατάστασης",
  import_csv_data: "Εισαγωγή CSV",
  bulk_create_contacts: "Μαζική δημιουργία",
  smart_excel_import: "Έξυπνη εισαγωγή Excel",
  add_task: "Δημιουργία εργασίας",
  create_request: "Δημιουργία αιτήματος",
  schedule_reminder: "Υπενθύμιση",
  start_call: "Έναρξη κλήσης",
  get_todays_call_list: "Λίστα κλήσεων ημέρας",
  calculate_scores: "Υπολογισμός σκορ",
  bulk_send_nameday_wishes: "Μαζικές ευχές ονομαστικής",
  send_nameday_wishes: "Ευχές ονομαστικής",
  start_campaign: "Έναρξη καμπάνιας",
  add_calendar_event: "Προσθήκη στο ημερολόγιο",
  get_calendar_events: "Εκδηλώσεις ημερολογίου",
  morning_briefing: "Πρωινή ενημέρωση",
  write_letter: "Σύνταξη επιστολής",
  generate_letter: "Δημιουργία επιστολής",
  generate_press_release: "Δελτίο τύπου",
  generate_social_post: "Social media post",
  generate_content: "Δημιουργία περιεχομένου",
  analyze_document: "Ανάλυση εγγράφου",
  translate_text: "Μετάφραση",
  read_pdf: "Ανάγνωση PDF",
  create_event: "Δημιουργία εκδήλωσης",
  get_events: "Εκδηλώσεις",
  add_event_rsvp: "RSVP εκδήλωσης",
  create_poll: "Δημιουργία δημοσκόπησης",
  get_poll_results: "Αποτελέσματα δημοσκόπησης",
  get_volunteer_list: "Λίστα εθελοντών",
  get_documents: "Έγγραφα",
  search_media: "Αναζήτηση νέων",
  get_analytics: "Αναλυτικά",
  analyze_contacts: "Ανάλυση επαφών",
  run_analysis: "Εκτέλεση ανάλυσης",
  generate_pdf: "Δημιουργία PDF",
  generate_excel: "Δημιουργία Excel",
  generate_csv: "Δημιουργία CSV",
  get_weather: "Καιρός",
  get_news: "Νέα",
  get_sports: "Αθλητικά",
  scrape_url: "Ανάγνωση ιστοσελίδας",
  web_search: "Αναζήτηση στο internet",
  save_memory: "Αποθήκευση μνήμης",
  get_memories: "Ανάκτηση μνήμης",
  forget_memory: "Διαγραφή μνήμης",
  undo_last_action: "Αναίρεση ενέργειας",
  guide_user: "Οδηγός χρήσης",
};

export function greekToolLabel(t: string) {
  return GREEK_TOOL_LABELS[t] ?? t;
}

export function initialsName(first: string, last: string) {
  return `${(first?.[0] ?? "?").toUpperCase()}${(last?.[0] ?? "?").toUpperCase()}`;
}

export function canExecuteAction(role: string | null | undefined, a: ActionPayload) {
  if (a.action === "find_contacts") return false;
  if (a.action === "update_status") return true;
  return hasMinRole(role, "manager");
}

export function canConfirmStartCall(role: string | null | undefined, a: ActionPayload) {
  return a.action === "start_call" && hasMinRole(role, "manager");
}

export function canConfirmCreate(role: string | null | undefined, a: ActionPayload) {
  return a.action === "create_contact" && hasMinRole(role, "manager");
}

export function fmtTime(iso: string) {
  try {
    return formatChatTime(iso);
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
