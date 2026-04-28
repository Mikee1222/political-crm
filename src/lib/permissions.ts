/** Canonical CRM permission keys (DB `role_permissions.permission_key`). */

export const ALL_PERMISSION_KEYS = [
  "contacts_view",
  "contacts_create",
  "contacts_edit",
  "contacts_delete",
  "contacts_export",
  "contacts_import",
  "requests_view",
  "requests_create",
  "requests_edit",
  "requests_delete",
  "campaigns_view",
  "campaigns_create",
  "campaigns_start",
  "tasks_view",
  "tasks_create",
  "tasks_assign",
  "analytics_view",
  "documents_view",
  "documents_upload",
  "settings_view",
  "settings_edit",
  "users_manage",
  "roles_manage",
  "events_view",
  "events_create",
  "volunteers_view",
  "polls_view",
  "polls_create",
  "alexandra_use",
  "alexandra_bulk_delete",
  "alexandra_bulk_update",
  "alexandra_import",
  "alexandra_tool_bulk_delete_contacts",
  "alexandra_tool_bulk_update_contacts",
  "alexandra_tool_start_campaign",
  "alexandra_tool_send_whatsapp",
  "alexandra_tool_export_contacts",
  "alexandra_tool_create_user",
  "alexandra_tool_delete_data",
  "retell_call",
  "whatsapp_send",
  "export_data",
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export type PermissionCategoryId =
  | "contacts"
  | "requests"
  | "campaigns"
  | "tools"
  | "alexandra"
  | "alexandra_tools"
  | "settings";

export type PermissionCategory = {
  id: PermissionCategoryId;
  label: string;
  keys: readonly PermissionKey[];
};

export const PERMISSION_CATEGORIES: readonly PermissionCategory[] = [
  {
    id: "contacts",
    label: "Επαφές",
    keys: [
      "contacts_view",
      "contacts_create",
      "contacts_edit",
      "contacts_delete",
      "contacts_export",
      "contacts_import",
    ],
  },
  {
    id: "requests",
    label: "Αιτήματα",
    keys: ["requests_view", "requests_create", "requests_edit", "requests_delete"],
  },
  {
    id: "campaigns",
    label: "Καμπάνιες",
    keys: ["campaigns_view", "campaigns_create", "campaigns_start"],
  },
  {
    id: "tools",
    label: "Εργαλεία",
    keys: [
      "tasks_view",
      "tasks_create",
      "tasks_assign",
      "analytics_view",
      "documents_view",
      "documents_upload",
      "events_view",
      "events_create",
      "volunteers_view",
      "polls_view",
      "polls_create",
      "retell_call",
      "whatsapp_send",
      "export_data",
    ],
  },
  {
    id: "alexandra",
    label: "Αλεξάνδρα",
    keys: [
      "alexandra_use",
      "alexandra_bulk_delete",
      "alexandra_bulk_update",
      "alexandra_import",
    ],
  },
  {
    id: "alexandra_tools",
    label: "Αλεξάνδρα — εργαλεία",
    keys: [
      "alexandra_tool_bulk_delete_contacts",
      "alexandra_tool_bulk_update_contacts",
      "alexandra_tool_start_campaign",
      "alexandra_tool_send_whatsapp",
      "alexandra_tool_export_contacts",
      "alexandra_tool_create_user",
      "alexandra_tool_delete_data",
    ],
  },
  {
    id: "settings",
    label: "Ρυθμίσεις",
    keys: ["settings_view", "settings_edit", "users_manage", "roles_manage"],
  },
] as const;

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  contacts_view: "Προβολή επαφών",
  contacts_create: "Δημιουργία επαφών",
  contacts_edit: "Επεξεργασία επαφών",
  contacts_delete: "Διαγραφή επαφών",
  contacts_export: "Εξαγωγή επαφών",
  contacts_import: "Εισαγωγή επαφών",
  requests_view: "Προβολή αιτημάτων",
  requests_create: "Δημιουργία αιτημάτων",
  requests_edit: "Επεξεργασία αιτημάτων",
  requests_delete: "Διαγραφή αιτημάτων",
  campaigns_view: "Προβολή καμπανιών",
  campaigns_create: "Δημιουργία καμπανιών",
  campaigns_start: "Εκκίνηση κλήσεων καμπάνιας",
  tasks_view: "Προβολή εργασιών",
  tasks_create: "Δημιουργία εργασιών",
  tasks_assign: "Ανάθεση εργασιών",
  analytics_view: "Αναλυτικά",
  documents_view: "Έγγραφα — προβολή",
  documents_upload: "Έγγραφα — μεταφόρτωση",
  settings_view: "Ρυθμίσεις — προβολή",
  settings_edit: "Ρυθμίσεις — επεξεργασία",
  users_manage: "Διαχείριση χρηστών",
  roles_manage: "Διαχείριση ρόλων",
  events_view: "Εκδηλώσεις — προβολή",
  events_create: "Εκδηλώσεις — δημιουργία",
  volunteers_view: "Εθελοντές",
  polls_view: "Δημοσκοπήσεις — προβολή",
  polls_create: "Δημοσκοπήσεις — δημιουργία",
  alexandra_use: "Χρήση Αλεξάνδρας",
  alexandra_bulk_delete: "Αλεξάνδρα — μαζική διαγραφή",
  alexandra_bulk_update: "Αλεξάνδρα — μαζική ενημέρωση",
  alexandra_import: "Αλεξάνδρα — εισαγωγή",
  alexandra_tool_bulk_delete_contacts: "Εργαλείο: μαζική διαγραφή επαφών",
  alexandra_tool_bulk_update_contacts: "Εργαλείο: μαζική ενημέρωση επαφών",
  alexandra_tool_start_campaign: "Εργαλείο: εκκίνηση καμπάνιας",
  alexandra_tool_send_whatsapp: "Εργαλείο: WhatsApp",
  alexandra_tool_export_contacts: "Εργαλείο: εξαγωγή επαφών",
  alexandra_tool_create_user: "Εργαλείο: δημιουργία χρήστη",
  alexandra_tool_delete_data: "Εργαλείο: διαγραφή δεδομένων",
  retell_call: "Retell — κλήσεις",
  whatsapp_send: "WhatsApp — αποστολή",
  export_data: "Εξαγωγή δεδομένων (εργαλεία)",
};

export const ALEXANDRA_TOOL_KEYS = PERMISSION_CATEGORIES.find((c) => c.id === "alexandra_tools")!.keys;
