import type { SupabaseClient } from "@supabase/supabase-js";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import Anthropic from "@anthropic-ai/sdk";
import Papa from "papaparse";
import { hasMinRole } from "@/lib/roles";
import type { UserProfile } from "@/lib/auth-helpers";
import { runIndexRangeWithConcurrency } from "@/lib/async-pool";
import { anthropicComplete } from "@/lib/anthropic-once";
import { getContactIdsForNameDay } from "@/lib/nameday-celebrating";
import { athensOffsetForYmd, formatAthensDueDate, todayYmdAthens } from "@/lib/athens-ranges";
import { SUMMARY_MODEL } from "@/lib/ai-summary";
import {
  getRequestStatusQueryValues,
  REQUEST_STATUS_OPEN,
} from "@/lib/request-statuses";
import type { AlexandraPageContext } from "@/contexts/alexandra-page-context";
import {
  applyFindContactsToolInput,
  applySavedFilterJson,
  buildContactsPageUrl,
  contactFiltersToSearchParams,
  getDefaultContactFilters,
} from "@/lib/contacts-filters";
import { buildAlexandraPdf } from "@/lib/alexandra-pdf";
import { storeAlexandraExport } from "@/lib/alexandra-storage";
import { buildAlexandraExcel, buildAlexandraCsv, buildAlexandraExportMatrix } from "@/lib/alexandra-files";
import {
  buildExportRows,
  buildImportPreview,
  buildImportTemplateAoa,
  DEFAULT_EXPORT_FIELDS,
  detectColumns,
  transformSpreadsheetRow,
} from "@/lib/spreadsheet-import";
import { runAlexandraAnalysis } from "@/lib/alexandra-analysis";
import { scrapePublicUrl } from "@/lib/alexandra-scrape";
import { fetchWeatherForCity } from "@/lib/alexandra-weather";
import { fetchNews, fetchSports } from "@/lib/alexandra-news";
import { runPoliticalResearch, runPoliticalDailyBriefing, type PoliticalResearchType } from "@/lib/alexandra-political-research";
import {
  resolveContactMunicipalityForWrite,
  resolveMunicipalityExportFilters,
  searchMunicipalities,
} from "@/lib/municipality-search";
import {
  alexandraContactSearchLimit,
  normalizeContactSearchFilters,
} from "@/lib/alexandra-contact-search";

/** Fields allowed when merging spreadsheet row into existing contact (no phone change here). */
const ALEX_BULK_UPDATE_FIELDS = new Set<string>([
  "first_name",
  "last_name",
  "father_name",
  "mother_name",
  "email",
  "phone2",
  "landline",
  "age",
  "gender",
  "occupation",
  "nickname",
  "spouse_name",
  "municipality",
  "electoral_district",
  "toponym",
  "political_stance",
  "priority",
  "call_status",
  "notes",
  "area",
  "tags",
  "influence",
  "name_day",
  "birthday",
  "source",
]);

export type FindRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  call_status: string | null;
  contact_code?: string | null;
};

export const ALEX_TOOLS: Tool[] = [
  {
    name: "find_contacts",
    description:
      "Αναζήτηση επαφών. Επιστρέφει έως 75 επαφές (προαιρετικό limit έως 100). Fuzzy search: pass το search. Φίλτρα: call_status, call_statuses, ομάδες (group_ids, exclude, groups_include/exclude by name), birth_year_from/to, δήμος, κ.λπ. Αν ο χρήστης αναφέρει αποθηκευμένο φίλτρο (π.χ. ‘κλασσικά’), get_saved_filters ή/και saved_filter_name· επιστρέφει filter_url για /contacts. Πάντα αναφέρει filter_url από το tool result (για κουμπί Ιστορικού/πλοήγησης).",
    input_schema: {
      type: "object" as const,
      properties: {
        search: { type: "string" as const, description: "Όρος αναζήτησης" },
        saved_filter_name: {
          type: "string" as const,
          description: "Όνομα αποθηκευμένου φίλτρου (π.χ. κλασσικά)—φορτώνει τα αποθηκευμένα json φίλτρα",
        },
        call_status: {
          type: "string" as const,
          enum: ["Pending", "Positive", "Negative", "No Answer"] as const,
        },
        call_statuses: {
          type: "array" as const,
          items: { type: "string" as const, enum: ["Pending", "Positive", "Negative", "No Answer"] as const },
          description: "Πολλαπλά status μαζί",
        },
        area: { type: "string" as const },
        municipality: { type: "string" as const },
        priority: { type: "string" as const, enum: ["High", "Medium", "Low"] as const },
        tag: { type: "string" as const },
        phone: { type: "string" as const },
        political_stance: { type: "string" as const },
        group_id: { type: "string" as const, description: "Μονή ομάδα (UUID)" },
        group_ids: { type: "array" as const, items: { type: "string" as const } },
        exclude_group_ids: { type: "array" as const, items: { type: "string" as const } },
        groups_include: { type: "array" as const, items: { type: "string" as const }, description: "Όπως group_ids" },
        groups_exclude: { type: "array" as const, items: { type: "string" as const }, description: "Όνομα ομάδας ή UUID" },
        birth_year_from: { type: "number" as const },
        birth_year_to: { type: "number" as const },
        age_min: { type: "number" as const },
        age_max: { type: "number" as const },
        not_contacted_days: { type: "number" as const },
        score_tier: { type: "string" as const, enum: ["low", "mid", "high"] as const },
        is_volunteer: { type: "boolean" as const },
        volunteer_area: { type: "string" as const },
        nameday_today: { type: "boolean" as const },
        limit: { type: "number" as const, description: "Μέγιστα αποτελέσματα (προαιρ., default 75, max 100)" },
      },
    },
  },
  {
    name: "get_saved_filters",
    description:
      "Λίστα αποθηκευμένων φίλτρων (name, description, filters, filter_url) για /contacts. Χρήση πριν το find όταν ο χρήστης ζητά ‘τα κλασσικά’ ή παρόμοιο.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "update_contact",
    description:
      "Πλήρης ενημέρωση πεδίων επαφής (απαιτεί δικαίωμα manager). Ένα objeto fields με μόνο τα πεδία προς αλλαγή. Εκτέλεση: PUT /api/contacts/[id]",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const, description: "UUID επαφής" },
        fields: {
          type: "object" as const,
          description:
            "Κλειδιά: first_name, last_name, father_name, mother_name, phone, email, age, gender, occupation, nickname, spouse_name, municipality, electoral_district, toponym, political_stance, priority, call_status, notes, area, tags (array), influence (bool)",
        },
      },
      required: ["contact_id", "fields"],
    },
  },
  {
    name: "update_contact_status",
    description: "Αλλαγή status επαφής",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        status: { type: "string" as const, enum: ["Pending", "Positive", "Negative", "No Answer"] as const },
      },
      required: ["contact_id", "status"],
    },
  },
  {
    name: "add_task",
    description: "Προσθήκη νέου task",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const },
        due_date: { type: "string" as const, description: "YYYY-MM-DD format" },
        contact_id: { type: "string" as const, description: "Optional contact ID" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_request",
    description: "Δημιουργία νέου αιτήματος πολίτη",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        title: { type: "string" as const },
        category: { type: "string" as const, enum: ["Υγεία", "Εκπαίδευση", "Εργασία", "Υποδομές", "Άλλο"] as const },
        description: { type: "string" as const },
      },
      required: ["title", "category"],
    },
  },
  {
    name: "add_note",
    description: "Προσθήκη σημείωσης σε επαφή",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        note: { type: "string" as const },
      },
      required: ["contact_id", "note"],
    },
  },
  {
    name: "get_contact_details",
    description: "Λεπτομέρειες συγκεκριμένης επαφής",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "get_stats",
    description: "Στατιστικά CRM — contacts, requests, tasks, campaigns",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string" as const, enum: ["overview", "contacts", "requests", "tasks", "campaigns"] as const },
      },
    },
  },
  {
    name: "start_call",
    description: "Έναρξη outbound κλήσης σε επαφή μέσω Retell",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const },
        contact_name: { type: "string" as const },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "create_contact",
    description:
      "Δημιουργία νέας επαφής. Χρησιμοποίησε όταν κάποιος δίνει ονοματεπώνυμο και τηλέφωνο. Εκτέλεση: POST /api/contacts",
    input_schema: {
      type: "object" as const,
      properties: {
        first_name: { type: "string" as const },
        last_name: { type: "string" as const },
        phone: { type: "string" as const },
        municipality: { type: "string" as const },
        area: { type: "string" as const },
        political_stance: { type: "string" as const },
        notes: { type: "string" as const },
        email: { type: "string" as const },
        father_name: { type: "string" as const, description: "Πατρώνυμο" },
        mother_name: { type: "string" as const, description: "Μητρώνυμο" },
      },
      required: ["first_name", "last_name", "phone"],
    },
  },
  {
    name: "read_pdf",
    description: "Ανάγνωση PDF ή κειμένου από URL· εξαγωγή κειμένου / σύνοψη. Input: url, question (προαιρετικό).",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string" as const },
        question: { type: "string" as const },
      },
      required: ["url"],
    },
  },
  {
    name: "import_csv_data",
    description:
      "Εισαγωγή επαφών από raw CSV/δεδομένα με mapping στηλών σε πεδία CRM. ΠΑΝΤΑ πρώτα confirmed: false — preview· μετά true μετά ρητή επιβεβαίωση.",
    input_schema: {
      type: "object" as const,
      properties: {
        data: { type: "string" as const },
        mapping: { type: "object" as const, description: "Χάρτης: όνομα στήλης CSV → first_name, last_name, phone, ..." },
        confirmed: { type: "boolean" as const, description: "true = εκτέλεση import" },
      },
      required: ["data", "mapping"],
    },
  },
  {
    name: "bulk_create_contacts",
    description:
      "Μαζική δημιουργία επαφών από αρχείο (Excel/CSV) μετά το mapping. Χρήση ΜΟΝΟ μετά επιβεβαίωση. Το mapping (στήλες αρχείου → πεδία CRM) υποχρεωτικό. " +
      "Οι πλήρεις γραμμές έρχονται αυτόματα από το συνημμένο. Μπορείς παραλείψεις το `rows` στο input. " +
      "Υποστηριζόμενα: first_name, last_name, full_name (ελληνική σειρά + Title Case), phone (κελί με πολλούς αριθμούς: 1ο κινητό 69…→phone, 2ο κινητό→phone2, 2… σταθερό→landline), context_municipality (τίτλος αρχείου/φύλλο → municipality+area+toponym όταν λείπουν), email, municipality, area, toponym, notes, political_stance, father_name, mother_name, occupation, ignore.",
    input_schema: {
      type: "object" as const,
      properties: {
        rows: {
          type: "array" as const,
          description: "Ήδη γνωστές γραμμές (object ανά σειρά) — αλλιώς κενό για συνημμένο",
          items: { type: "object" as const },
        },
        mapping: {
          type: "object" as const,
          description: "Πχ. { \"Ονοματεπώνυμο\": \"full_name\", \"Κινητό\": \"phone\" } — κλειδιά: κελί/στήλη όπως το αρχείο",
        },
        context_municipality: {
          type: "string" as const,
          description: "Τόπος από τίτλο/φύλλο (π.χ. Αστακός)· εφαρμόζεται σε municipality, area, toponym όταν λείπουν στις γραμμές",
        },
      },
      required: ["mapping"],
    },
  },
  {
    name: "search_contacts_advanced",
    description:
      "Προχωρημένη αναζήτηση επαφών με πολλαπλά φίλτρα. Input: filters (name, phone, municipality, area, call_status, priority, political_stance, age_min, age_max, tag), limit (προαιρετικό).",
    input_schema: {
      type: "object" as const,
      properties: {
        filters: { type: "object" as const },
        limit: { type: "number" as const },
      },
      required: ["filters"],
    },
  },
  {
    name: "get_all_contacts",
    description:
      "Λίστα επαφών για ανάλυση/αναφορά (manager). Έως 10.000 εγγραφές. Ίδια φίλτρα με search + limit. Χρησιμοποίησε αντί για μικρό find όταν θες πλήρη εικόνα.",
    input_schema: {
      type: "object" as const,
      properties: {
        filters: {
          type: "object" as const,
          description: "Ίδια με find: search, call_status, municipality, area, priority, tag, group_id, phone, political_stance, age_min, age_max",
        },
        limit: { type: "number" as const, description: "1–10000, default 2000" },
      },
    },
  },
  {
    name: "bulk_update_contacts",
    description:
      "Μαζική ενημέρωση: contact_ids (πίνακας UUID) + fields (object) — ίδια επιτρεπτά πεδία με update_contact. (manager only)",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_ids: { type: "array" as const, items: { type: "string" as const } },
        fields: { type: "object" as const },
      },
      required: ["contact_ids", "fields"],
    },
  },
  {
    name: "bulk_delete_contacts",
    description:
      "Μαζική διαγραφή επαφών: είτε contact_ids είτε filters (ίδιο format με get_all). ΠΑΝΤΑ πρώτα user_confirmed: false — επιστρέφει preview· μετά user_confirmed: true μόνο αφού ο χρήστης απαντήσει Ναι/επιβεβαιώσει. Μπορεί «διέγραψε χωρίς τηλ.» = filters+λογική (προσοχή: το κύριο phone είναι υποχρεωτικό σχεδόν πάντα). (manager)",
    input_schema: {
      type: "object" as const,
      properties: {
        user_confirmed: { type: "boolean" as const, description: "Ψευδές = μόνο προεπισκόπηση" },
        contact_ids: { type: "array" as const, items: { type: "string" as const } },
        filters: { type: "object" as const, description: "Όπως get_all_contacts" },
      },
      required: ["user_confirmed"],
    },
  },
  {
    name: "smart_excel_import",
    description:
      "Έξυπνο import Excel/CSV: αυτόματη αντιστοίχιση στηλών, preview/validation, διπλότυπα. ΠΑΝΤΑ πρώτα confirmed/user_confirmed: false — preview· μετά true μετά ρητή επιβεβαίωση.",
    input_schema: {
      type: "object" as const,
      properties: {
        rows: { type: "array" as const, items: { type: "object" as const } },
        mapping: { type: "object" as const, description: "Προαιρετικό — auto-detect αν λείπει" },
        context_municipality: { type: "string" as const },
        confirmed: { type: "boolean" as const, description: "true = εκτέλεση import" },
        user_confirmed: { type: "boolean" as const, description: "Ίδιο με confirmed" },
        skip_duplicates: { type: "boolean" as const, description: "Προεπιλογή true" },
        update_existing: { type: "boolean" as const, description: "Default false" },
        duplicate_mode: {
          type: "string" as const,
          enum: ["ask_user" as const, "skip" as const, "update" as const],
          description: "ask_user: μόνον αναφορά διπλοτύπων· skip/update: ίδιο με τα flags",
        },
      },
    },
  },
  {
    name: "save_memory",
    description: "Αποθήκευσε σημαντική πληροφορία για μελλοντική χρήση (προτιμήσεις, σημαντικά facts).",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string" as const, description: "π.χ. user_preferences" },
        value: { type: "string" as const },
      },
      required: ["key", "value"],
    },
  },
  {
    name: "get_memories",
    description: "Φόρτωσε αποθηκευμένες πληροφορίες για αυτόν το χρήστη (ήδη συμπεριλαμβάνονται στο system prompt, αλλά μπορείς να το καλέσεις εάν χρειάζεται ανανέωση).",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "forget_memory",
    description: "Διέγραψε αποθηκευμένη μνήμη με βάση το key (όταν ο χρήστης ζητά να ξεχάσεις κάτι).",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string" as const, description: "Το key της μνήμης προς διαγραφή" },
      },
      required: ["key"],
    },
  },
  {
    name: "schedule_reminder",
    description:
      "Πρόσθεσε υπενθύμιση: δημιουργεί task με title = message και due_date από ημερομηνία. Προαιρετικό contact_id· αλλιώς χρησιμοποίησε την επαφή της τρέχουσας σελίδας. datetime σε ISO 8601.",
    input_schema: {
      type: "object" as const,
      properties: {
        message: { type: "string" as const },
        datetime: { type: "string" as const, description: "ISO 8601, π.χ. 2026-04-27T09:00:00" },
        contact_id: { type: "string" as const, description: "Προαιρετικό" },
      },
      required: ["message", "datetime"],
    },
  },
  {
    name: "add_calendar_event",
    description:
      "Προσθήκη event στο Google Calendar του βουλευτή (manager). Χρειάζεται σύνδεση Google Calendar.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const },
        date: { type: "string" as const, description: "YYYY-MM-DD" },
        start_time: { type: "string" as const, description: "HH:MM" },
        end_time: { type: "string" as const, description: "HH:MM" },
        location: { type: "string" as const },
        description: { type: "string" as const },
        type: { type: "string" as const, description: "meeting|event|campaign|other" },
      },
      required: ["title", "date", "start_time", "end_time"],
    },
  },
  {
    name: "get_calendar_events",
    description: "Εμφάνιση προγράμματος βουλευτή από Google Calendar (ημέρα ή εβδομάδα).",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string" as const, description: "YYYY-MM-DD, προαιρετικό (default σήμερα)" },
        week: { type: "boolean" as const, description: "Αν true, εβδομάδα που περιέχει την date" },
      },
    },
  },
  {
    name: "analyze_contacts",
    description:
      "Ανάλυση επαφών: ομαδοποίηση & ποσοστά (municipality, area, political_stance, age_group, call_status, priority).",
    input_schema: {
      type: "object" as const,
      properties: {
        group_by: {
          type: "string" as const,
          enum: ["municipality", "area", "political_stance", "age_group", "call_status", "priority"] as const,
        },
        filters: { type: "object" as const, description: "Ίδια με get_all_contacts" },
      },
      required: ["group_by"],
    },
  },
  {
    name: "generate_letter",
    description: "Σύνταξη επίσημης επιστολής προς υπουργείο/δημόσιο (ελληνικά, Claude).",
    input_schema: {
      type: "object" as const,
      properties: {
        recipient_name: { type: "string" as const },
        recipient_title: { type: "string" as const },
        recipient_ministry: { type: "string" as const },
        subject: { type: "string" as const },
        issue_description: { type: "string" as const },
        citizen_name: { type: "string" as const },
        letter_type: {
          type: "string" as const,
          enum: ["αίτηση", "καταγγελία", "ερώτημα", "παρέμβαση"] as const,
        },
      },
      required: ["recipient_name", "subject", "issue_description", "letter_type"],
    },
  },
  {
    name: "generate_press_release",
    description: "Σύνταξη ανακοίνωσης τύπου (Claude, ελληνικά).",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: { type: "string" as const },
        key_points: { type: "array" as const, items: { type: "string" as const } },
        tone: { type: "string" as const, enum: ["επίσημο", "φιλικό", "επείγον"] as const },
      },
      required: ["topic", "key_points", "tone"],
    },
  },
  {
    name: "generate_social_post",
    description: "Post για social media (ελληνικά).",
    input_schema: {
      type: "object" as const,
      properties: {
        topic: { type: "string" as const },
        platform: { type: "string" as const, enum: ["facebook", "instagram", "twitter"] as const },
        tone: { type: "string" as const },
        include_hashtags: { type: "boolean" as const },
      },
      required: ["topic", "platform", "tone"],
    },
  },
  {
    name: "bulk_send_nameday_wishes",
    description: "Καμπάνια ευχών (επαφές που γιορτάζουν) — δημιουργία καμπάνιας Retell/κλήσεων.",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string" as const, description: "YYYY-MM-DD, default σήμερα" },
        municipality: { type: "string" as const },
      },
    },
  },
  {
    name: "find_contacts_not_called",
    description: "Επαφές χωρίς κλήση (ποτέ ή > X ημερών).",
    input_schema: {
      type: "object" as const,
      properties: {
        days_ago: { type: "number" as const },
        municipality: { type: "string" as const },
        limit: { type: "number" as const },
      },
    },
  },
  {
    name: "analyze_document",
    description: "Ανάλυση εγγράφου/νόμου — σύνοψη & σημεία (Claude).",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string" as const },
        question: { type: "string" as const },
        document_type: { type: "string" as const, enum: ["νόμος", "άρθρο", "αίτημα", "έγγραφο"] as const },
      },
      required: ["text", "document_type"],
    },
  },
  {
    name: "morning_briefing",
    description: "Ημερήσια ενημέρωση βουλευτή: briefing, calendar, αιτήματα, κλήσεις (σύνθεση).",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "calculate_scores",
    description: "Υπολογισμός predicted score (0–100, πειθω) για όλες τις επαφές. Ενημερώνει τη στήλη predicted_score.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "generate_content",
    description:
      "Δημιουργία περιεχομένου: ανακοίνωση τύπου, post social, ή επιστολή. Εκτέλεση: POST /api/content/generate με type και params.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string" as const, enum: ["press_release", "social_post", "letter"] as const },
        params: { type: "object" as const, description: "Παράμετροι ανά τύπο (topic, key_points, tone, κ.λπ.)" },
      },
      required: ["type", "params"],
    },
  },
  {
    name: "translate_text",
    description: "Μετάφραση κειμένου (Claude).",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string" as const },
        from_language: { type: "string" as const },
        to_language: { type: "string" as const },
      },
      required: ["text", "to_language"],
    },
  },
  {
    name: "search_media",
    description: "Αναζήτηση ειδήσεων (GET /api/media/search).",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const },
      },
    },
  },
  {
    name: "add_event_rsvp",
    description: "Προσθήκη RSVP σε εκδήλωση (POST /api/events/:id/rsvps).",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: { type: "string" as const },
        contact_id: { type: "string" as const },
      },
      required: ["event_id", "contact_id"],
    },
  },
  {
    name: "get_volunteer_list",
    description: "Λίστα εθελοντών (GET /api/volunteers), προαιρετικό area.",
    input_schema: {
      type: "object" as const,
      properties: {
        area: { type: "string" as const },
      },
    },
  },
  {
    name: "get_contact_summary",
    description: "AI σύνοψη επαφής (2-3 προτάσεις) — cache ή νέα παραγωγή Claude.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_id: { type: "string" as const, description: "UUID επαφής" },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "get_todays_call_list",
    description: "Έξυπνη λίστα κλήσεων σήμερα (αποθηκευμένη) με σκορ και εξήγηση παραγόντων.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "get_analytics",
    description: "Σύνοψη KPI και αναλυτικών (GET /api/analytics): επαφές, νέες 30ημέρου, θετικοί %, αιτήματα, γραφήματα-μεταδεδομένα.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "create_event",
    description: "Δημιουργία εκδήλωσης (POST /api/events).",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const },
        date: { type: "string" as const, description: "YYYY-MM-DD" },
        location: { type: "string" as const },
        type: { type: "string" as const },
        description: { type: "string" as const },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "get_events",
    description: "Λίστα εκδηλώσεων (GET /api/events). upcoming=true φιλτράρει μελλοντικές.",
    input_schema: {
      type: "object" as const,
      properties: { upcoming: { type: "boolean" as const } },
    },
  },
  {
    name: "create_poll",
    description: "Νέα δημοσκόπηση (POST /api/polls) — options ως κείμενα.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const },
        question: { type: "string" as const },
        options: { type: "array" as const, items: { type: "string" as const }, minItems: 2 },
        target_group_id: { type: "string" as const },
        ends_at: { type: "string" as const, description: "ISO ή YYYY-MM-DD" },
      },
      required: ["title", "question", "options"],
    },
  },
  {
    name: "get_poll_results",
    description: "Αποτελέσματα δημοσκόπησης (GET /api/polls/:id).",
    input_schema: {
      type: "object" as const,
      properties: { poll_id: { type: "string" as const } },
      required: ["poll_id"],
    },
  },
  {
    name: "start_campaign",
    description: "Εκκίνηση επόμενης κλήσης καμπάνιας (POST /api/campaigns/:id/dial-next).",
    input_schema: {
      type: "object" as const,
      properties: { campaign_id: { type: "string" as const } },
      required: ["campaign_id"],
    },
  },
  {
    name: "search_municipalities",
    description:
      "Αναζήτηση δήμων στο μητρώο CRM· επιστρέφει ακριβείς ονομασίες από τη βάση (case/accent insensitive, μερικό ταίριασμα). Χρησιμοποίησε πριν από export_contacts όταν ο χρήστης αναφέρει δήμο.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Μερικό όνομα δήμου, π.χ. Βόνιτσα, Αγρίνιο" },
      },
      required: ["query"],
    },
  },
  {
    name: "export_contacts",
    description:
      "Εξαγωγή επαφών CSV ή Excel με ελληνικές κεφαλίδες, φίλτρα και επιλογή πεδίων (έως 50000). Χρησιμοποίησε ΠΑΝΤΑ αυτό το tool για εξαγωγές. Για φίλτρο δήμου: πρώτα search_municipalities ή πέρασε το κείμενο του χρήστη — το export επιλύει αυτόματα τις ακριβείς τιμές.",
    input_schema: {
      type: "object" as const,
      properties: {
        filters: { type: "object" as const, description: "Προαιρετικά φίλτρα επαφών" },
        format: { type: "string" as const, enum: ["excel", "csv"] as const, description: "Default excel" },
        fields: {
          type: "array" as const,
          items: { type: "string" as const },
          description: "Πεδία CRM προς εξαγωγή",
        },
        filename: { type: "string" as const, description: "Προαιρετικό όνομα αρχείου (χωρίς επέκταση)" },
      },
    },
  },
  {
    name: "generate_import_template",
    description: "Δημιουργεί πρότυπο Excel/CSV για εισαγωγή επαφών με ελληνικές κεφαλίδες, οδηγίες και παραδείγματα.",
    input_schema: {
      type: "object" as const,
      properties: {
        format: { type: "string" as const, enum: ["excel", "csv"] as const },
        include_examples: { type: "boolean" as const },
      },
    },
  },
  {
    name: "get_documents",
    description: "Έγγραφα (GET /api/documents) — προαιρετικό contact_id.",
    input_schema: {
      type: "object" as const,
      properties: { contact_id: { type: "string" as const } },
    },
  },
  {
    name: "bulk_update_status",
    description: "Μαζική ενημέρωση call_status επαφών (POST /api/contacts/manager-bulk-update).",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_ids: { type: "array" as const, items: { type: "string" as const } },
        status: { type: "string" as const, enum: ["Pending", "Positive", "Negative", "No Answer"] as const },
      },
      required: ["contact_ids", "status"],
    },
  },
  {
    name: "generate_pdf",
    description: "Δημιουργία PDF για λήψη (signed URL). title + content κείμενο.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" as const },
        content: { type: "string" as const },
        type: { type: "string" as const, description: "Τύπος εγγράφου, προαιρετικό" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "generate_excel",
    description: "Δημιουργία Excel (.xlsx) από πίνακα αντικειμένων — επιστρέφει download_url.",
    input_schema: {
      type: "object" as const,
      properties: {
        data: { type: "array" as const, items: { type: "object" as const } },
        filename: { type: "string" as const },
      },
      required: ["data", "filename"],
    },
  },
  {
    name: "generate_csv",
    description: "Δημιουργία CSV από πίνακα αντικειμένων — επιστρέφει download_url.",
    input_schema: {
      type: "object" as const,
      properties: {
        data: { type: "array" as const, items: { type: "object" as const } },
        filename: { type: "string" as const },
      },
      required: ["data", "filename"],
    },
  },
  {
    name: "run_analysis",
    description:
      "Προκαθορισμένη ανάλυση CRM (χωρίς arbitrary code): contacts_by_call_status, contacts_by_municipality, contacts_by_priority, contact_age_distribution, requests_by_status.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string" as const },
        data: { type: "array" as const, items: { type: "object" as const }, description: "Προαιρετικά δεδομένα αντί για DB" },
      },
      required: ["type"],
    },
  },
  {
    name: "get_weather",
    description: "Τρέχων καιρός πόλης (Open-Meteo).",
    input_schema: {
      type: "object" as const,
      properties: { city: { type: "string" as const } },
      required: ["city"],
    },
  },
  {
    name: "get_sports",
    description: "Αθλητικά νέα/αποτελέσματα από RSS (Google News).",
    input_schema: {
      type: "object" as const,
      properties: {
        sport: { type: "string" as const },
        query: { type: "string" as const },
      },
    },
  },
  {
    name: "get_news",
    description: "Τρέχοντα νέα από RSS (Google News) για όρο αναζήτησης.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" as const } },
      required: ["query"],
    },
  },
  {
    name: "scrape_url",
    description: "Ανάγνωση δημόσιου URL (HTML → κείμενο). Μόνο http/https, όχι εσωτερικά δίκτυα.",
    input_schema: {
      type: "object" as const,
      properties: { url: { type: "string" as const } },
      required: ["url"],
    },
  },
  {
    name: "political_research",
    description:
      "Έρευνα για βουλευτές, κόμματα, ψηφοφορίες και πολιτικές εξελίξεις. Χρησιμοποίησε για σύγκριση θέσεων, παρακολούθηση αντιπάλων και πολιτική ανάλυση.",
    input_schema: {
      type: "object" as const,
      properties: {
        subject: { type: "string" as const, description: "Όνομα βουλευτή, κόμματος ή θέμα" },
        research_type: {
          type: "string" as const,
          enum: ["news", "statements", "votes", "comparison", "local_impact", "social_media", "full_profile"] as const,
          description: "Τύπος έρευνας",
        },
        time_range: {
          type: "string" as const,
          enum: ["today", "week", "month", "all"] as const,
          description: "Χρονικό εύρος αναζήτησης",
        },
        compare_with_kostas: { type: "boolean" as const, description: "Σύγκριση με θέσεις Καραγκούνη" },
      },
      required: ["subject", "research_type"],
    },
  },
  {
    name: "political_daily_briefing",
    description:
      "Πλήρες πολιτικό briefing: νέα αντιπάλων, τύπος Αιτωλοακαρνανίας, Βουλή, social media. Εκτέλεσε 8-10 web searches και σύνθεσε αναλυτική αναφορά.",
    input_schema: {
      type: "object" as const,
      properties: {
        focus: { type: "string" as const, description: "Προαιρετικό θέμα εστίασης" },
      },
    },
  },
];

export type ToolContext = {
  supabase: SupabaseClient;
  forward: (path: string, init: RequestInit) => Promise<Response>;
  profile: UserProfile;
  role: string;
  userId: string;
  /** When set, tool gates use this matrix; when omitted, legacy hasMinRole checks apply. */
  allowedPermissionKeys?: ReadonlySet<string>;
  /** Επαφή από /contacts/[id] — default για tools με contact_id */
  defaultContactId?: string | null;
  /** Πλήρεις γραμμές import από το τρέχον αίτημα (client attachment) */
  importRows?: Array<Record<string, unknown>>;
  /** Από sheet name / επισύναψη — ιδρύει περιοχή+δήμο όταν κενά στη γραμμή */
  importContextMunicipality?: string;
  onBulkProgress?: (current: number, total: number) => void;
};

function pickContactId(raw: unknown, ctx: ToolContext): string {
  const a = raw != null && String(raw).trim() ? String(raw).trim() : "";
  if (a) return a;
  return ctx.defaultContactId?.trim() ?? "";
}

async function buildGroupNameToIdMap(supabase: SupabaseClient) {
  const { data } = await supabase.from("contact_groups").select("id,name");
  const m = new Map<string, string>();
  for (const r of data ?? []) m.set(String(r.name).toLowerCase(), r.id);
  return m;
}

/** Resolve saved filter JSON by name (exact, then contains). */
export async function findSavedFilterJson(
  supabase: SupabaseClient,
  name: string,
): Promise<Record<string, unknown> | null> {
  const t = name.trim();
  if (!t) return null;
  const { data: d1 } = await supabase.from("saved_filters").select("filters").eq("name", t).maybeSingle();
  if (d1?.filters && typeof d1.filters === "object" && !Array.isArray(d1.filters)) {
    return d1.filters as Record<string, unknown>;
  }
  const { data: rows } = await supabase
    .from("saved_filters")
    .select("name,filters")
    .ilike("name", `%${t.replace(/[%_\\]/g, " ")}%`)
    .limit(8);
  const lower = t.toLowerCase();
  const hit = rows?.find(
    (r) =>
      String(r.name).toLowerCase() === lower || String(r.name).toLowerCase().includes(lower),
  );
  if (hit?.filters && typeof hit.filters === "object" && !Array.isArray(hit.filters)) {
    return hit.filters as Record<string, unknown>;
  }
  return null;
}

type ExportContactRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone2?: string | null;
  landline?: string | null;
  email?: string | null;
  municipality?: string | null;
  area?: string | null;
  toponym?: string | null;
  father_name?: string | null;
  mother_name?: string | null;
  gender?: string | null;
  age?: number | null;
  political_stance?: string | null;
  notes?: string | null;
  occupation?: string | null;
  priority?: string | null;
  birthday?: string | null;
  name_day?: string | null;
  created_at?: string | null;
  tags?: string[] | null;
  contact_code?: string | null;
  call_status?: string | null;
  contact_groups?: { name?: string } | { name?: string }[] | null;
  group_names?: string[];
};

/** Export: exact municipality match when resolved; partial (ilike) fallback for area/toponym/unresolved municipality. */
function buildExportContactFilters(
  f: Record<string, unknown>,
  opts?: { municipalityExact?: boolean },
): string {
  const params = new URLSearchParams(buildAdvancedContactFilters(f, {}));
  const hasMuni =
    Boolean(f.municipality) || (Array.isArray(f.municipalities) && f.municipalities.length > 0);
  const needsPartial =
    Boolean(f.area || f.toponym) || (hasMuni && !opts?.municipalityExact);
  if (needsPartial) params.set("partial_location", "1");
  return params.toString();
}

async function fetchContactsForExport(
  ctx: ToolContext,
  filters: Record<string, unknown>,
  maxLimit = 50_000,
): Promise<{
  contacts: ExportContactRow[];
  error?: string;
  resolvedMunicipalities?: string[];
  municipalityQueries?: string[];
}> {
  const muniResolution = await resolveMunicipalityExportFilters(ctx.supabase, filters);
  const exportFilters = muniResolution.filters;
  const all: ExportContactRow[] = [];
  /** List pagination: page + page_size. Do not pass `limit` — /api/contacts treats it as combobox mode (no total/page). */
  const requestedPageSize = 500;
  let page = 1;
  let total: number | undefined;

  while (all.length < maxLimit) {
    const q = buildExportContactFilters(exportFilters, {
      municipalityExact: muniResolution.municipalityExact,
    });
    const params = new URLSearchParams(q);
    params.set("page", String(page));
    params.set("page_size", String(Math.min(requestedPageSize, maxLimit - all.length)));
    const r = await ctx.forward(`/api/contacts?${params.toString()}`, { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as {
      contacts?: ExportContactRow[];
      error?: string;
      total?: number;
      pageSize?: number;
    };
    if (!r.ok) return { contacts: [], error: j.error || "Σφάλμα" };
    const batch = j.contacts ?? [];
    total = j.total ?? total;
    if (!batch.length) break;
    all.push(...batch);
    const effectivePageSize = j.pageSize ?? requestedPageSize;
    if (batch.length < effectivePageSize) break;
    if (total != null && all.length >= total) break;
    page += 1;
  }

  return {
    contacts: all.slice(0, maxLimit),
    resolvedMunicipalities: muniResolution.resolved.length ? muniResolution.resolved : undefined,
    municipalityQueries: muniResolution.queries.length ? muniResolution.queries : undefined,
  };
}

async function resolveImportGroupId(
  supabase: SupabaseClient,
  groupName: string,
): Promise<string | null> {
  const t = groupName.trim();
  if (!t) return null;
  const { data } = await supabase.from("contact_groups").select("id,name").ilike("name", t).limit(5);
  const exact = data?.find((g) => String(g.name).toLowerCase() === t.toLowerCase());
  if (exact?.id) return String(exact.id);
  const partial = data?.find((g) => String(g.name).toLowerCase().includes(t.toLowerCase()));
  return partial?.id ? String(partial.id) : null;
}

function contactPayloadForApi(payload: Record<string, unknown>): Record<string, unknown> {
  const body = { ...payload };
  delete body._import_group_name;
  return body;
}

/**
 * mapping: column header from sheet → CRM field (first_name, last_name, full_name, phone, …).
 * Delegates to spreadsheet-import transformSpreadsheetRow.
 */
export function mapSpreadsheetRowToContactPayload(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  options?: { contextMunicipality?: string },
): { payload: Record<string, unknown> | null; skip?: "no_phone" | "no_first_name" | "incomplete_name" } {
  const result = transformSpreadsheetRow(row, mapping, options);
  if (result.skip === "no_first_name") {
    return { payload: null, skip: "incomplete_name" };
  }
  return result;
}

function buildAdvancedContactFilters(f: Record<string, unknown>, extra?: { limit?: number }): string {
  const normalized = normalizeContactSearchFilters(f);
  const p = new URLSearchParams();
  if (normalized.search) p.set("search", String(normalized.search));
  if (normalized.name) p.set("name", String(normalized.name));
  if (normalized.first_name) p.set("first_name", String(normalized.first_name));
  if (normalized.last_name) p.set("last_name", String(normalized.last_name));
  if (normalized.father_name) p.set("father_name", String(normalized.father_name));
  if (normalized.phone) p.set("phone", String(normalized.phone));
  if (Array.isArray(normalized.municipalities) && normalized.municipalities.length) {
    p.set("municipalities", normalized.municipalities.map(String).join(","));
  } else if (normalized.municipality) p.set("municipality", String(normalized.municipality));
  if (Array.isArray(normalized.toponyms) && normalized.toponyms.length) {
    p.set("toponyms", normalized.toponyms.map(String).join(","));
  } else if (normalized.toponym) p.set("toponym", String(normalized.toponym));
  if (normalized.area) p.set("area", String(normalized.area));
  if (normalized.call_status) p.set("call_status", String(normalized.call_status));
  if (normalized.priority) p.set("priority", String(normalized.priority));
  if (normalized.political_stance) p.set("political_stance", String(normalized.political_stance));
  if (normalized.tag) p.set("tag", String(normalized.tag));
  if (normalized.group_id) p.set("group_id", String(normalized.group_id));
  if (normalized.age_min != null) p.set("age_min", String(normalized.age_min));
  if (normalized.age_max != null) p.set("age_max", String(normalized.age_max));
  if (extra?.limit != null) p.set("limit", String(extra.limit));
  return p.toString();
}

export type ToolRunResult = {
  /** String passed back to Anthropic as tool_result */
  content: string;
  findResults?: FindRow[];
  /** /contacts?… for «Δείξε στις Επαφές» */
  filterUrl?: string;
  confirmCall?: { contact_id: string; name: string; phone: string };
  /** For UI "Εκτελέστηκε" badge — false for start_call (χρειάζεται Ναι/Όχι) */
  executedToolName?: string;
  showExecutedTag?: boolean;
};

function contactAgeGroup(age: unknown): string {
  const a = typeof age === "number" ? age : parseInt(String(age), 10);
  if (!Number.isFinite(a)) return "Άγνωστο";
  if (a <= 30) return "18–30";
  if (a <= 45) return "31–45";
  if (a <= 60) return "46–60";
  return "60+";
}

function groupContactsRaw(
  rows: Array<Record<string, unknown>>,
  groupBy: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    let k = "Άγνωστο";
    if (groupBy === "municipality")
      k = String(r.municipality ?? "Άγνωστο").trim() || "Άγνωστο";
    else if (groupBy === "area")
      k = String(r.area ?? "Άγνωστο").trim() || "Άγνωστο";
    else if (groupBy === "political_stance")
      k = String(r.political_stance ?? "Άγνωστο").trim() || "Άγνωστο";
    else if (groupBy === "call_status")
      k = String(r.call_status ?? "Άγνωστο").trim() || "Άγνωστο";
    else if (groupBy === "priority")
      k = String(r.priority ?? "Άγνωστο").trim() || "Άγνωστο";
    else if (groupBy === "age_group") k = contactAgeGroup(r.age);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export async function runAlexTool(
  name: string,
  input: Record<string, unknown> | null | undefined,
  ctx: ToolContext,
): Promise<ToolRunResult> {
  try {
    return await runAlexToolInner(name, input, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: JSON.stringify({ error: true, message: `Σφάλμα: ${message}`, tool: name }),
    };
  }
}

async function runAlexToolInner(
  name: string,
  input: Record<string, unknown> | null | undefined,
  ctx: ToolContext,
): Promise<ToolRunResult> {
  const raw = input && typeof input === "object" ? input : {};
  const isMgr = hasMinRole(ctx.profile.role, "manager", ctx.profile.access_tier);
  function permLegacy(permissionKey: string, legacy: boolean): boolean {
    if (ctx.allowedPermissionKeys !== undefined) {
      return ctx.allowedPermissionKeys.has(permissionKey);
    }
    return legacy;
  }
  const canEditContacts = permLegacy("contacts_edit", isMgr);

  if (name === "find_contacts") {
    const gMap = await buildGroupNameToIdMap(ctx.supabase);
    let f = getDefaultContactFilters();
    const sfn =
      (typeof raw.saved_filter_name === "string" && raw.saved_filter_name.trim() ? raw.saved_filter_name : null) ??
      (typeof raw.filter_alias === "string" && raw.filter_alias.trim() ? raw.filter_alias : null) ??
      (typeof raw.saved_filter === "string" && raw.saved_filter.trim() ? raw.saved_filter : null);
    if (sfn) {
      const jSaved = await findSavedFilterJson(ctx.supabase, sfn);
      if (jSaved) f = applySavedFilterJson(jSaved, gMap);
    }
    f = applyFindContactsToolInput(f, raw, gMap);
    const displayLimit = alexandraContactSearchLimit(raw);
    f.limit = String(displayLimit);
    const filterUrl = buildContactsPageUrl(f);
    const q = contactFiltersToSearchParams(f).toString();
    const r = await ctx.forward(`/api/contacts?${q}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: FindRow[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα αναζήτησης" }), filterUrl };
    }
    const all = (j.contacts ?? []) as FindRow[];
    const list = all.slice(0, displayLimit) as FindRow[];
    return {
      content: JSON.stringify({
        ok: true,
        count: all.length,
        filter_url: filterUrl,
        contacts: list,
      }),
      findResults: list,
      filterUrl,
      executedToolName: "find_contacts",
    };
  }

  if (name === "get_saved_filters") {
    const gMap = await buildGroupNameToIdMap(ctx.supabase);
    const { data, error } = await ctx.supabase
      .from("saved_filters")
      .select("id, name, description, filters, created_at")
      .order("name", { ascending: true });
    if (error) {
      return { content: JSON.stringify({ error: error.message }) };
    }
    const rows = data ?? [];
    const saved_filters = rows.map((row) => {
      const j = row.filters as Record<string, unknown> | null;
      const f = applySavedFilterJson(j && typeof j === "object" && !Array.isArray(j) ? j : null, gMap);
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        filters: row.filters,
        filter_url: buildContactsPageUrl(f),
      };
    });
    return {
      content: JSON.stringify({ ok: true, saved_filters }),
      executedToolName: "get_saved_filters",
    };
  }

  if (name === "update_contact") {
    if (!permLegacy("contacts_edit", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η επεξεργασία επαφών για αυτόν τον ρόλο" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    const fields = raw.fields;
    if (!contact_id || !fields || typeof fields !== "object" || Array.isArray(fields) || fields === null) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_id και fields (object)" }) };
    }
    const allow = new Set<string>([
      "first_name",
      "last_name",
      "phone",
      "phone2",
      "landline",
      "email",
      "age",
      "gender",
      "occupation",
      "nickname",
      "spouse_name",
      "municipality",
      "electoral_district",
      "toponym",
      "political_stance",
      "priority",
      "call_status",
      "notes",
      "area",
      "tags",
      "influence",
      "name_day",
      "father_name",
      "mother_name",
    ]);
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      if (allow.has(k) && v !== undefined) {
        body[k] = v;
      }
    }
    if (Object.keys(body).length === 0) {
      return { content: JSON.stringify({ error: "Καθόλου επιτρεπτά πεδία" }) };
    }
    if (typeof body.municipality === "string" && body.municipality.trim()) {
      const resolved = await resolveContactMunicipalityForWrite(ctx.supabase, body.municipality);
      body.municipality = resolved.municipality;
    }
    const r = await ctx.forward(`/api/contacts/${contact_id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { error?: string; contact?: unknown };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα ενημέρωσης" }) };
    }
    return {
      content: JSON.stringify({
        ok: true,
        message: "Η επαφή ενημερώθηκε.",
        contact: j.contact,
      }),
      executedToolName: "update_contact",
    };
  }

  if (name === "update_contact_status") {
    const contact_id = pickContactId(raw.contact_id, ctx);
    const status = String(raw.status ?? "");
    if (!contact_id || !status) {
      return { content: JSON.stringify({ error: "Άκυρα δεδομένα" }) };
    }
    if (!canEditContacts) {
      const { data, error } = await ctx.supabase
        .from("contacts")
        .update({ call_status: status })
        .eq("id", contact_id)
        .select("id")
        .single();
      if (error) return { content: JSON.stringify({ error: error.message }) };
      return {
        content: JSON.stringify({ ok: true, message: "Η κατάσταση κλήσης ενημερώθηκε.", id: data?.id }),
        executedToolName: "update_contact_status",
      };
    }
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Δεν έχετε δικαίωμα" }) };
    }
    const { data, error } = await ctx.supabase
      .from("contacts")
      .update({ call_status: status })
      .eq("id", contact_id)
      .select("id")
      .single();
    if (error) return { content: JSON.stringify({ error: error.message }) };
    return {
      content: JSON.stringify({ ok: true, message: "Η κατάσταση ενημερώθηκε.", id: data?.id }),
      executedToolName: "update_contact_status",
    };
  }

  if (name === "add_task") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const title = String(raw.title ?? "").trim();
    const contact_id = pickContactId(raw.contact_id, ctx) || null;
    const due = raw.due_date != null && String(raw.due_date) !== "null" ? String(raw.due_date) : null;
    if (!title) {
      return { content: JSON.stringify({ error: "Κενό τίτλο" }) };
    }
    const { data, error } = await ctx.supabase
      .from("tasks")
      .insert({
        contact_id,
        title,
        due_date: due,
        completed: false,
      })
      .select("id")
      .single();
    if (error) {
      if (error.message.includes("null") || error.message.includes("violates")) {
        return {
          content: JSON.stringify({
            error:
              "Χρειάζεται επαφή (contact_id) ή άνοιγμα σελίδας επαφής, ή find_contacts. Γενικές εργασίες: ενημερώστε τη βάση (contact_id optional).",
            detail: error.message,
          }),
        };
      }
      return { content: JSON.stringify({ error: error.message }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Η εργασία προστέθηκε.", id: data?.id }),
      executedToolName: "add_task",
    };
  }

  if (name === "create_request") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    const title = String(raw.title ?? "").trim();
    const category = String(raw.category ?? "Άλλο");
    const description = raw.description != null ? String(raw.description) : null;
    if (!title) {
      return { content: JSON.stringify({ error: "Κενός τίτλος" }) };
    }
    if (!contact_id) {
      return {
        content: JSON.stringify({
          error: "Χρειάζεται contact_id. Χρησιμοποιήστε find_contacts και επιλέξτε UUID επαφής.",
        }),
      };
    }
    const r = await ctx.forward("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id,
        title,
        category: category || "Άλλο",
        description,
        status: REQUEST_STATUS_OPEN,
      }),
    });
    const j = (await r.json()) as { error?: string; request?: unknown };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Το αίτημα δημιουργήθηκε.", result: j.request }),
      executedToolName: "create_request",
    };
  }

  if (name === "add_note") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    const note = String(raw.note ?? "").trim();
    if (!contact_id || !note) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_id και note" }) };
    }
    const { data: cur, error: e0 } = await ctx.supabase.from("contacts").select("notes").eq("id", contact_id).single();
    if (e0) {
      return { content: JSON.stringify({ error: e0.message }) };
    }
    const nextNote = [cur?.notes, note].filter(Boolean).join("\n\n");
    const { error: e1 } = await ctx.supabase.from("contacts").update({ notes: nextNote }).eq("id", contact_id);
    if (e1) {
      return { content: JSON.stringify({ error: e1.message }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Η σημείωση αποθηκεύτηκε." }),
      executedToolName: "add_note",
    };
  }

  if (name === "get_contact_details") {
    const contact_id = pickContactId(raw.contact_id, ctx);
    if (!contact_id) {
      return { content: JSON.stringify({ error: "Χρειάζεται contact_id" }) };
    }
    const { data, error } = await ctx.supabase.from("contacts").select("*").eq("id", contact_id).maybeSingle();
    if (error) {
      return { content: JSON.stringify({ error: error.message }) };
    }
    if (!data) {
      return { content: JSON.stringify({ error: "Η επαφή δεν βρέθηκε" }) };
    }
    return { content: JSON.stringify({ ok: true, contact: data }), executedToolName: "get_contact_details" };
  }

  if (name === "get_stats") {
    const st = (raw.type as string) || "overview";
    const supa = ctx.supabase;

    const { count: totalContacts } = await supa.from("contacts").select("id", { count: "exact", head: true });
    const { data: stRows, error: stErr } = await supa.from("contacts").select("call_status");
    if (stErr) {
      return { content: JSON.stringify({ error: stErr.message }) };
    }
    const byStatus: Record<string, number> = {};
    for (const row of (stRows ?? []) as { call_status: string | null }[]) {
      const k = row.call_status || "Κενό";
      byStatus[k] = (byStatus[k] ?? 0) + 1;
    }
    const { count: openRequests } = await supa
      .from("requests")
      .select("id", { count: "exact", head: true })
      .in("status", getRequestStatusQueryValues(REQUEST_STATUS_OPEN));
    const { count: pendingTasks } = await supa
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("completed", false);
    const { count: totalRequests } = await supa.from("requests").select("id", { count: "exact", head: true });
    const { count: campaignsN } = await supa.from("campaigns").select("id", { count: "exact", head: true });
    const payload = {
      type: st,
      overview: {
        totalContacts: totalContacts ?? 0,
        byStatus,
        openRequests: openRequests ?? 0,
        totalRequests: totalRequests ?? 0,
        pendingTasks: pendingTasks ?? 0,
        campaigns: campaignsN ?? 0,
      },
    };
    return { content: JSON.stringify(payload), executedToolName: "get_stats" };
  }

  if (name === "start_call") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager μπορεί να ξεκινά κλήσεις" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    if (!contact_id) {
      return { content: JSON.stringify({ error: "Χρειάζεται contact_id (ή άνοιγμα σελίδας επαφής)" }) };
    }
    const cr = await ctx.forward(`/api/contacts/${contact_id}`, { method: "GET" });
    const j = (await cr.json()) as {
      contact?: { first_name: string; last_name: string; phone: string | null };
    };
    if (!cr.ok || !j.contact) {
      return { content: JSON.stringify({ error: "Η επαφή δεν βρέθηκε" }) };
    }
    const c = j.contact;
    const displayName = `${c.first_name} ${c.last_name}`.trim();
    const phone = c.phone || "—";
    return {
      content: JSON.stringify({
        ok: true,
        confirm_required: true,
        contact_id,
        name: displayName,
        phone,
        message: "Ζητήθηκε επιβεβαίωση — ο χρήστης θα δει κουμπιά Ναι/Όχι.",
      }),
      confirmCall: { contact_id, name: displayName, phone },
      showExecutedTag: false,
    };
  }

  if (name === "create_contact") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const first_name = String(raw.first_name ?? "").trim();
    const last_name = String(raw.last_name ?? "").trim();
    const phone = String(raw.phone ?? "").trim();
    if (!first_name || !last_name || !phone) {
      return { content: JSON.stringify({ error: "Υποχρεωτικά: first_name, last_name, phone" }) };
    }
    const body: Record<string, unknown> = { first_name, last_name, phone, call_status: "Pending", priority: "Medium" };
    for (const k of [
      "municipality",
      "area",
      "political_stance",
      "notes",
      "email",
      "father_name",
      "mother_name",
      "phone2",
      "landline",
    ] as const) {
      if (raw[k] != null && String(raw[k]).trim() !== "") body[k] = raw[k];
    }
    if (typeof body.municipality === "string" && body.municipality.trim()) {
      const resolved = await resolveContactMunicipalityForWrite(ctx.supabase, body.municipality);
      body.municipality = resolved.municipality;
    }
    const r = await ctx.forward("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json()) as { error?: string; contact?: unknown };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Αποτυχία" }) };
    }
    return {
      content: JSON.stringify({ ok: true, message: "Η επαφή δημιουργήθηκε.", contact: j.contact }),
      executedToolName: "create_contact",
    };
  }

  if (name === "read_pdf") {
    const url = String(raw.url ?? "");
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { content: JSON.stringify({ error: "Χρειάζεται http(s) URL" }) };
    }
    const question = String(raw.question ?? "Σύνοψη");
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      return { content: JSON.stringify({ error: `Λήψη απέτυχε: ${res.status}` }) };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const maxBytes = 8_000_000;
    if (buf.length > maxBytes) {
      return { content: JSON.stringify({ error: "Πολύ μεγάλο αρχείο" }) };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    let text = "";
    if (ct.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const pdfParse = require("pdf-parse") as (b: Buffer) => Promise<{ text?: string }>;
      const d = await pdfParse(buf);
      text = d.text ?? "";
    } else {
      text = buf.toString("utf8");
    }
    const trimmed = text.slice(0, 32_000);
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      const cl = new Anthropic({ apiKey: key });
      const msg = await cl.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Κείμενο από αρχείο/URL (μπορεί ατελές):\n---\n${trimmed}\n---\n\nΕρώτημα: ${question}\n\nΣύντομη απάντηση στα ελληνικά. Αν δεν αρκεί το κείμενο, πες τι λείπει.`,
          },
        ],
      });
      const t = (msg.content[0] as { type: string; text?: string } | undefined)?.type === "text" ? (msg.content[0] as { text: string }).text : JSON.stringify(msg.content[0]);
      return { content: JSON.stringify({ ok: true, answer: t, excerpt_length: trimmed.length }), executedToolName: "read_pdf" };
    }
    return { content: JSON.stringify({ ok: true, text: trimmed, excerpt_length: trimmed.length }), executedToolName: "read_pdf" };
  }

  if (name === "import_csv_data") {
    if (!permLegacy("alexandra_import", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η εισαγωγή για αυτόν τον ρόλο" }) };
    }
    const dataStr = String(raw.data ?? "");
    const mapping = raw.mapping;
    if (!dataStr || !mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return { content: JSON.stringify({ error: "Χρειάζονται data και mapping (object)" }) };
    }
    const parsed = Papa.parse<Record<string, string>>(dataStr, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
    if (parsed.errors.length) {
      return { content: JSON.stringify({ error: "CSV: " + parsed.errors[0]?.message }) };
    }
    const map = mapping as Record<string, string>;
    const confirmed = raw.confirmed === true;
    type CsvContact = {
      first_name: string;
      last_name: string;
      phone: string;
      email?: string | null;
      area?: string | null;
      municipality?: string | null;
      electoral_district?: string | null;
      toponym?: string | null;
      political_stance?: string | null;
      notes?: string | null;
    };
    const contacts: CsvContact[] = [];
    const mappedRows: Array<Record<string, string>> = [];
    let validCount = 0;
    let skipCount = 0;
    for (const row of parsed.data) {
      const o: Record<string, string> = {};
      for (const [csvCol, crmField] of Object.entries(map)) {
        if (!crmField) continue;
        const v = row[csvCol] ?? row[csvCol.trim()];
        if (v != null) o[crmField] = String(v).trim();
      }
      mappedRows.push(o);
      const first_name = o.first_name;
      const last_name = o.last_name;
      const phone = o.phone;
      if (!first_name || !phone) {
        skipCount++;
        continue;
      }
      validCount++;
      if (!last_name) continue;
      contacts.push({
        first_name,
        last_name,
        phone,
        email: o.email || null,
        area: o.area || null,
        municipality: o.municipality || null,
        electoral_district: o.electoral_district || null,
        toponym: o.toponym || null,
        political_stance: o.political_stance || null,
        notes: o.notes || null,
      });
    }
    const totalRows = parsed.data.length;
    if (!confirmed) {
      const sample = mappedRows
        .filter((o) => o.first_name && o.phone)
        .slice(0, 5)
        .map((o) => ({
          first_name: o.first_name,
          last_name: o.last_name || "",
          phone: o.phone,
          email: o.email || null,
          municipality: o.municipality || null,
          area: o.area || null,
        }));
      return {
        content: JSON.stringify({
          ok: true,
          preview: true,
          requires_user_confirmation: true,
          summary: {
            total_rows: totalRows,
            valid_rows: validCount,
            invalid_rows: skipCount,
          },
          sample,
          message: `Θέλεις να προχωρήσω με την εισαγωγή ${validCount} επαφών;`,
        }),
        showExecutedTag: false,
        executedToolName: "import_csv_data",
      };
    }
    if (contacts.length === 0) {
      return { content: JSON.stringify({ error: "Δεν εξήχθησαν έγκυρες γραμμές" }) };
    }
    const r = await ctx.forward("/api/contacts/import-mapped", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts }),
    });
    const j = (await r.json()) as { inserted?: number; errors?: number; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "import-mapped" }) };
    }
    return {
      content: JSON.stringify({ ok: true, inserted: j.inserted, error_rows: j.errors, message: "Εισήχθησαν (ή επιχειρήθηκαν) οι εγγραφές." }),
      executedToolName: "import_csv_data",
    };
  }

  if (name === "bulk_create_contacts") {
    if (!permLegacy("alexandra_import", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η μαζική δημιουργία για αυτόν τον ρόλο" }) };
    }
    const mapping = raw.mapping;
    if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
      return { content: JSON.stringify({ error: "Χρειάζεται mapping (object): στήλη αρχείου → πεδίο CRM" }) };
    }
    const fromTool = typeof raw.context_municipality === "string" ? raw.context_municipality.trim() : "";
    const contextMunicipality = fromTool || ctx.importContextMunicipality;
    const mapObj = mapping as Record<string, string>;
    let rows: Array<Record<string, unknown>> = [];
    if (Array.isArray(raw.rows) && raw.rows.length > 0) {
      rows = raw.rows as Array<Record<string, unknown>>;
    } else if (ctx.importRows?.length) {
      rows = ctx.importRows;
    }
    if (rows.length === 0) {
      return {
        content: JSON.stringify({
          error:
            "Δεν βρέθηκαν γραμμές. Ζήτα από τον χρήστη να ξανα-ανεβάσει το αρχείο ή βεβαιώσου ότι το import είναι ακόμα ενεργό στο ίδιο αίτημα.",
        }),
      };
    }
    const list = rows;
    const totalRows = list.length;
    const ROW_BATCH = 100;
    const CONCURRENCY = 10;
    type Outcome = "created" | "skip_phone" | "skip_name" | "failed" | "other_skip";
    const perRow: Outcome[] = new Array<Outcome>(totalRows);
    const failed: { index: number; err: string }[] = [];
    for (let batchStart = 0; batchStart < totalRows; batchStart += ROW_BATCH) {
      const batchEnd = Math.min(batchStart + ROW_BATCH, totalRows);
      await runIndexRangeWithConcurrency(batchStart, batchEnd, CONCURRENCY, async (i) => {
        try {
          const { payload, skip } = mapSpreadsheetRowToContactPayload(list[i]!, mapObj, {
            contextMunicipality: contextMunicipality || undefined,
          });
          if (skip === "no_phone") {
            perRow[i] = "skip_phone";
            return;
          }
          if (skip === "incomplete_name") {
            perRow[i] = "skip_name";
            return;
          }
          if (!payload) {
            perRow[i] = "other_skip";
            return;
          }
          const r = await ctx.forward("/api/contacts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          if (!r.ok) {
            perRow[i] = "failed";
            failed.push({ index: i + 1, err: j.error || "POST" });
          } else {
            perRow[i] = "created";
          }
        } catch (e) {
          perRow[i] = "failed";
          failed.push({ index: i + 1, err: e instanceof Error ? e.message : "Σφάλμα" });
        } finally {
          ctx.onBulkProgress?.(i + 1, totalRows);
        }
      });
    }
    let created = 0;
    let skippedNoPhone = 0;
    let skippedName = 0;
    for (const o of perRow) {
      if (o === "created") created += 1;
      if (o === "skip_phone") skippedNoPhone += 1;
      if (o === "skip_name") skippedName += 1;
    }
    const parts = [
      `Δημιουργήθηκαν ${created} επαφές`,
      skippedNoPhone > 0 ? `${skippedNoPhone} παραλείφθηκαν (κενό/μη έγκυρο τηλέφωνο)` : null,
      skippedName > 0 ? `${skippedName} παραλείφθηκαν (ατελές ονοματεπώνυμο)` : null,
      failed.length > 0 ? `${failed.length} απέτυχαν: ${JSON.stringify(failed.slice(0, 5))}` : null,
    ].filter(Boolean);
    return {
      content: JSON.stringify({
        ok: true,
        created,
        skipped_no_phone: skippedNoPhone,
        skipped_incomplete_name: skippedName,
        failed,
        message: parts.join(" · "),
      }),
      executedToolName: "bulk_create_contacts",
    };
  }

  if (name === "search_contacts_advanced") {
    const fl = (raw.filters as Record<string, unknown>) || {};
    const lim = alexandraContactSearchLimit({ limit: raw.limit });
    const q = buildAdvancedContactFilters(fl, { limit: Math.min(12_000, lim * 4) });
    const r = await ctx.forward(`/api/contacts?${q}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: FindRow[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    const list = (j.contacts ?? []).slice(0, lim) as FindRow[];
    return {
      content: JSON.stringify({ ok: true, count: list.length, contacts: list }),
      findResults: list,
      executedToolName: "search_contacts_advanced",
    };
  }

  if (name === "get_all_contacts") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const fl = (raw.filters as Record<string, unknown>) || {};
    const lim = Math.min(10_000, Math.max(1, Number(raw.limit) || 2000));
    const q = buildAdvancedContactFilters(fl, { limit: lim });
    const r = await ctx.forward(`/api/contacts?${q}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: FindRow[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    const list = (j.contacts ?? []) as FindRow[];
    return {
      content: JSON.stringify({
        ok: true,
        count: list.length,
        contacts: list,
        note: list.length >= lim ? "Φτάσατε το όριο limit· στενέψτε φίλτρα αν χρειάζεται." : null,
      }),
      findResults: list.slice(0, 50),
      executedToolName: "get_all_contacts",
    };
  }

  if (name === "bulk_update_contacts") {
    if (!permLegacy("alexandra_tool_bulk_update_contacts", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η μαζική ενημέρωση για αυτόν τον ρόλο" }) };
    }
    const contact_ids = raw.contact_ids;
    const fields = raw.fields;
    if (!Array.isArray(contact_ids) || !fields || typeof fields !== "object" || Array.isArray(fields)) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_ids (array) και fields (object)" }) };
    }
    const r = await ctx.forward("/api/contacts/manager-bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids, fields }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean; updated?: number; failed?: number };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    return {
      content: JSON.stringify({
        ok: true,
        updated: j.updated,
        failed: j.failed,
        sample_errors: (j as { sample_errors?: unknown }).sample_errors,
      }),
      executedToolName: "bulk_update_contacts",
    };
  }

  if (name === "bulk_delete_contacts") {
    if (!permLegacy("alexandra_tool_bulk_delete_contacts", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η μαζική διαγραφή για αυτόν τον ρόλο" }) };
    }
    const user_confirmed = raw.user_confirmed === true;
    const body: Record<string, unknown> = { user_confirmed };
    if (Array.isArray(raw.contact_ids) && raw.contact_ids.length > 0) {
      body.contact_ids = raw.contact_ids;
    }
    if (raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters) && Object.keys(raw.filters as object).length > 0) {
      body.filters = raw.filters;
    }
    const hasIds = Array.isArray(raw.contact_ids) && raw.contact_ids.length > 0;
    const filt = raw.filters && typeof raw.filters === "object" && !Array.isArray(raw.filters) ? (raw.filters as Record<string, unknown>) : null;
    if (!hasIds && (!filt || Object.keys(filt).length === 0)) {
      return { content: JSON.stringify({ error: "Χρειάζονται contact_ids (μη κενά) ή filters με τουλάχιστον ένα κλειδί" }) };
    }
    const r = await ctx.forward("/api/contacts/manager-bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as {
      error?: string;
      mode?: string;
      would_delete?: number;
      sample?: unknown[];
      deleted?: number;
      message?: string;
    };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    if (j.mode === "preview") {
      return {
        content: JSON.stringify({
          ok: true,
          requires_user_confirmation: true,
          would_delete: j.would_delete,
          sample: j.sample,
          message: j.message,
        }),
        showExecutedTag: false,
        executedToolName: "bulk_delete_contacts",
      };
    }
    return {
      content: JSON.stringify({ ok: true, deleted: j.deleted }),
      executedToolName: "bulk_delete_contacts",
    };
  }

  if (name === "smart_excel_import") {
    if (!permLegacy("alexandra_import", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται το import για αυτόν τον ρόλο" }) };
    }
    const fromTool = typeof raw.context_municipality === "string" ? raw.context_municipality.trim() : "";
    const contextMunicipality = fromTool || ctx.importContextMunicipality;
    let rows: Array<Record<string, unknown>> = [];
    if (Array.isArray(raw.rows) && raw.rows.length > 0) {
      rows = raw.rows as Array<Record<string, unknown>>;
    } else if (ctx.importRows?.length) {
      rows = ctx.importRows;
    }
    if (rows.length === 0) {
      return {
        content: JSON.stringify({
          error: "Χρειάζονται γραμμές (rows) ή ενεργό συνημμένο import.",
        }),
      };
    }

    let mapObj: Record<string, string>;
    if (raw.mapping && typeof raw.mapping === "object" && !Array.isArray(raw.mapping)) {
      mapObj = raw.mapping as Record<string, string>;
    } else {
      const headers = Object.keys(rows[0] ?? {});
      mapObj = detectColumns(headers);
      if (!Object.keys(mapObj).length) {
        return {
          content: JSON.stringify({
            error: "Δεν αναγνωρίστηκαν στήλες. Δώσε mapping ή αρχείο με γνωστές κεφαλίδες (Όνομα, Επώνυμο, Κινητό…).",
            headers,
          }),
        };
      }
    }

    const confirmed = raw.confirmed === true || raw.user_confirmed === true;
    const skip_dup = raw.skip_duplicates !== false;
    const update_ex = raw.update_existing === true;
    const duplicate_mode = (raw.duplicate_mode as string) || (update_ex ? "update" : skip_dup ? "skip" : "skip");

    const phonesForLookup = [
      ...new Set(
        rows
          .map((row) => {
            const { payload } = transformSpreadsheetRow(row, mapObj, {
              contextMunicipality: contextMunicipality || undefined,
            });
            return payload && typeof payload.phone === "string" ? payload.phone : null;
          })
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const existingPhones = new Set<string>();
    const phoneToId = new Map<string, string>();
    for (let b = 0; b < phonesForLookup.length; b += 120) {
      const part = phonesForLookup.slice(b, b + 120);
      const { data: phRows } = await ctx.supabase
        .from("contacts")
        .select("id, phone, first_name, last_name")
        .in("phone", part);
      for (const pr of phRows ?? []) {
        if (pr.phone) {
          phoneToId.set(String(pr.phone), String(pr.id));
          existingPhones.add(String(pr.phone));
        }
      }
    }

    const preview = buildImportPreview(rows, mapObj, {
      contextMunicipality: contextMunicipality || undefined,
      existingPhones,
    });
    const { work } = preview;

    const dups: { row: number; phone: string; contact_id: string; name_hint?: string }[] = [];
    for (const w of work) {
      if (!w.payload) continue;
      const ph = String(w.payload.phone ?? "");
      const id = phoneToId.get(ph);
      if (id) {
        dups.push({
          row: w.index1,
          phone: ph,
          contact_id: id,
          name_hint: [w.payload.first_name, w.payload.last_name].filter(Boolean).join(" "),
        });
      }
    }

    if (!confirmed) {
      const mappingLines = Object.entries(mapObj)
        .map(([col, field]) => `• «${col}» → ${field}`)
        .join("\n");
      const sampleLines = preview.sample
        .slice(0, 5)
        .map(
          (s) =>
            `${s.first_name} ${s.last_name} — ${s.phone || "χωρίς τηλ."}${s.municipality ? ` — ${s.municipality}` : ""}`,
        )
        .join("\n");
      const dupHint =
        dups.length > 0
          ? `\n\n⚠️ Βρέθηκαν ${dups.length} διπλότυπα (ίδιο τηλέφωνο). Θέλεις να τα παραλείψω ή να τα ενημερώσω;`
          : "";
      return {
        content: JSON.stringify({
          ok: true,
          preview: true,
          requires_user_confirmation: true,
          summary: {
            total_rows: preview.totalRows,
            valid_rows: preview.validRows,
            invalid_rows: preview.invalidRows,
            duplicates: dups.length,
            duplicate_phones: preview.duplicatePhones,
            skip_no_phone: preview.sample.filter((s) => s.status === "no_phone").length,
            skip_no_first_name: preview.sample.filter((s) => s.status === "no_first_name").length,
          },
          detected_columns: preview.detectedColumns,
          sample: preview.sample,
          duplicates: dups.slice(0, 5),
          pending_rows: preview.pendingRows.slice(0, 10),
          message: `📊 Προεπισκόπηση εισαγωγής:
- Σύνολο γραμμών: ${preview.totalRows}
- Έγκυρες: ${preview.validRows}
- Μη έγκυρες: ${preview.invalidRows}
- Διπλότυπα: ${dups.length}

Αντιστοίχιση στηλών:
${mappingLines}

Δείγμα:
${sampleLines || "—"}${dupHint}

Επιβεβαιώνεις την εισαγωγή; (ναι/όχι)`,
        }),
        showExecutedTag: false,
        executedToolName: "smart_excel_import",
      };
    }

    if (duplicate_mode === "ask_user" && dups.length > 0) {
      return {
        content: JSON.stringify({
          ok: true,
          duplicate_count: dups.length,
          duplicates: dups,
          message:
            "Βρέθηκαν διπλότυπα (ίδιο phone). Ρώτα τον χρήστη: παράλειψη, ενημέρωση με νέα δεδομένα, ή μόνο λίστα. Ξανακάλεσε smart_excel_import με skip_duplicates / update_existing / duplicate_mode: skip|update αντίστοιχα.",
        }),
        showExecutedTag: false,
        executedToolName: "smart_excel_import",
      };
    }

    const totalRows = work.length;
    const CONCURRENCY = 8;
    const failed: { index: number; err: string }[] = [];
    const outcome = new Array<string>(totalRows).fill("pending");
    await runIndexRangeWithConcurrency(0, totalRows, CONCURRENCY, async (i) => {
      const w = work[i]!;
      if (w.skip === "no_phone") {
        outcome[i] = "skip_no_phone";
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      if (w.skip === "no_first_name") {
        outcome[i] = "skip_no_first_name";
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      if (!w.payload) {
        outcome[i] = "skip_other";
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      const pl = { ...w.payload };
      const groupName = typeof pl._import_group_name === "string" ? pl._import_group_name.trim() : "";
      delete pl._import_group_name;
      const ph = String(pl.phone);
      const existing = phoneToId.get(ph);
      if (existing) {
        if (update_ex) {
          const body: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(pl)) {
            if (k === "phone" || k.startsWith("_")) continue;
            if (ALEX_BULK_UPDATE_FIELDS.has(k) && v !== undefined) {
              body[k] = v;
            }
          }
          const r = await ctx.forward(`/api/contacts/${existing}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!r.ok) {
            const j = (await r.json().catch(() => ({}))) as { error?: string };
            failed.push({ index: w.index1, err: j.error || "PATCH" });
            outcome[i] = "failed";
          } else {
            if (groupName) {
              const gid = await resolveImportGroupId(ctx.supabase, groupName);
              if (gid) {
                await ctx.forward(`/api/contacts/${existing}/groups`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ group_id: gid }),
                });
              }
            }
            outcome[i] = "updated";
          }
        } else if (skip_dup) {
          outcome[i] = "skipped_dup";
        } else {
          failed.push({ index: w.index1, err: "duplicate_phone" });
          outcome[i] = "failed";
        }
        ctx.onBulkProgress?.(i + 1, totalRows);
        return;
      }
      const apiBody = contactPayloadForApi(pl);
      if (groupName) {
        const gid = await resolveImportGroupId(ctx.supabase, groupName);
        if (gid) apiBody.group_id = gid;
      }
      const r = await ctx.forward("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiBody),
      });
      const postBody = (await r.text().catch(() => "")) || "{}";
      let jr: { contact?: { id?: string }; error?: string } = {};
      try {
        jr = JSON.parse(postBody) as { contact?: { id?: string }; error?: string };
      } catch {
        /* ignore */
      }
      if (!r.ok) {
        failed.push({ index: w.index1, err: jr.error || "POST" });
        outcome[i] = "failed";
      } else {
        if (jr.contact?.id) {
          phoneToId.set(ph, String(jr.contact.id));
        }
        outcome[i] = "created";
      }
      ctx.onBulkProgress?.(i + 1, totalRows);
    });
    const created = outcome.filter((o) => o === "created").length;
    const updated = outcome.filter((o) => o === "updated").length;
    const skipped = outcome.filter((o) => o === "skipped_dup" || o === "skip_other").length;
    const skip_no_phone = outcome.filter((o) => o === "skip_no_phone").length;
    const skip_name = outcome.filter((o) => o === "skip_no_first_name").length;
    return {
      content: JSON.stringify({
        ok: true,
        created,
        updated,
        skipped,
        skipped_no_phone: skip_no_phone,
        skipped_no_first_name: skip_name,
        failed,
        duplicates_skipped: dups.length > 0 && skip_dup && !update_ex ? dups.length : 0,
        message: `✅ Νέες: ${created}, ενημερώσεις: ${updated}, παραλείφθηκαν: ${skipped + skip_no_phone + skip_name}${failed.length > 0 ? ` · αποτυχίες: ${failed.length}` : ""}`,
      }),
      executedToolName: "smart_excel_import",
    };
  }

  if (name === "save_memory") {
    const key = String(raw.key ?? "").trim().slice(0, 200);
    const value = String(raw.value ?? "").trim().slice(0, 32_000);
    if (!key || !value) {
      return { content: JSON.stringify({ error: "Χρειάζονται key και value" }), showExecutedTag: false };
    }
    const { error } = await ctx.supabase.from("alexandra_memory").upsert(
      {
        user_id: ctx.userId,
        key,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,key" },
    );
    if (error) return { content: JSON.stringify({ error: error.message }), showExecutedTag: false };
    return {
      content: JSON.stringify({ ok: true, message: "Η μνήμη αποθηκεύτηκε." }),
      executedToolName: "save_memory",
    };
  }

  if (name === "get_memories") {
    const { data, error } = await ctx.supabase
      .from("alexandra_memory")
      .select("key, value, updated_at")
      .eq("user_id", ctx.userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return { content: JSON.stringify({ error: error.message }), showExecutedTag: false };
    return {
      content: JSON.stringify({ ok: true, memories: data ?? [] }),
      executedToolName: "get_memories",
      showExecutedTag: false,
    };
  }

  if (name === "forget_memory") {
    const key = String(raw.key ?? "").trim().slice(0, 200);
    if (!key) {
      return { content: JSON.stringify({ error: "Χρειάζεται key" }), showExecutedTag: false };
    }
    const { error } = await ctx.supabase
      .from("alexandra_memory")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("key", key);
    if (error) return { content: JSON.stringify({ error: error.message }), showExecutedTag: false };
    return {
      content: JSON.stringify({ ok: true, message: "Η μνήμη διαγράφηκε." }),
      executedToolName: "forget_memory",
    };
  }

  if (name === "schedule_reminder") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const message = String(raw.message ?? "").trim();
    const dtStr = String(raw.datetime ?? "").trim();
    const contact_id = pickContactId(raw.contact_id, ctx) || null;
    if (!message || !dtStr) {
      return { content: JSON.stringify({ error: "Χρειάζονται message και datetime" }) };
    }
    const d = new Date(dtStr);
    if (!Number.isFinite(d.getTime())) {
      return { content: JSON.stringify({ error: "Άκυρη ημερομηνία/ώρα (χρησιμοποιήστε ISO 8601)" }) };
    }
    const hasTime = /T\d{1,2}:\d{2}/.test(dtStr);
    const due_date = formatAthensDueDate(d, hasTime);
    const { data, error } = await ctx.supabase
      .from("tasks")
      .insert({
        contact_id,
        title: message,
        due_date,
        completed: false,
      })
      .select("id")
      .single();
    if (error) {
      return { content: JSON.stringify({ error: error.message }) };
    }
    return {
      content: JSON.stringify({
        ok: true,
        message: `Ρυθμίστηκε υπενθύμιση (εργασία) με ημ/νία ${due_date}.`,
        id: data?.id,
      }),
      executedToolName: "schedule_reminder",
    };
  }

  if (name === "add_calendar_event") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const title = String(raw.title ?? "").trim();
    const date = String(raw.date ?? "").trim();
    const sTime = String(raw.start_time ?? "").trim();
    const eTime = String(raw.end_time ?? "").trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !sTime || !eTime) {
      return { content: JSON.stringify({ error: "Υποχρεωτικά title, date (YYYY-MM-DD), start_time, end_time (HH:MM)" }) };
    }
    const sNorm = sTime.length === 5 ? `${sTime}:00` : sTime;
    const eNorm = eTime.length === 5 ? `${eTime}:00` : eTime;
    const offset = athensOffsetForYmd(date);
    const start = `${date}T${sNorm}${offset}`;
    const end = `${date}T${eNorm}${offset}`;
    const typeStr = String(raw.type ?? "meeting").toLowerCase();
    const typeMap: Record<string, "meeting" | "event" | "campaign" | "other"> = {
      meeting: "meeting",
      event: "event",
      campaign: "campaign",
      other: "other",
    };
    const eventType = typeMap[typeStr] ?? "meeting";
    const r = await ctx.forward("/api/schedule/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        start,
        end,
        location: raw.location != null ? String(raw.location) : undefined,
        description: raw.description != null ? String(raw.description) : undefined,
        eventType,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Δεν αποθηκεύτηκε το event" }) };
    }
    return { content: JSON.stringify({ ok: true, message: "Το event προστέθηκε στο ημερολόγιο." }), executedToolName: "add_calendar_event" };
  }

  if (name === "get_calendar_events") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const dateIn = raw.date != null && String(raw.date).trim() ? String(raw.date).trim() : todayYmdAthens();
    const week = raw.week === true;
    const q = new URLSearchParams();
    if (week) {
      q.set("week", "1");
      q.set("date", /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : todayYmdAthens());
    } else {
      q.set("date", /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : todayYmdAthens());
    }
    const r = await ctx.forward(`/api/schedule/events?${q.toString()}`, { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as { events?: unknown; error?: string; connected?: boolean };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα ημερολογίου" }) };
    }
    return { content: JSON.stringify({ ok: true, events: j.events ?? [], connected: j.connected !== false }), executedToolName: "get_calendar_events" };
  }

  if (name === "analyze_contacts") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const groupBy = String(raw.group_by ?? "municipality");
    if (!["municipality", "area", "political_stance", "age_group", "call_status", "priority"].includes(groupBy)) {
      return { content: JSON.stringify({ error: "Άκυρο group_by" }) };
    }
    const fl = (raw.filters as Record<string, unknown>) || {};
    const q = buildAdvancedContactFilters(fl, { limit: 10_000 });
    const r = await ctx.forward(`/api/contacts?${q}`, { method: "GET" });
    const j = (await r.json()) as { contacts?: Array<Record<string, unknown>>; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    const list = (j.contacts ?? []) as Array<Record<string, unknown>>;
    const groups = groupContactsRaw(list, groupBy);
    const sorted = Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200);
    return {
      content: JSON.stringify({ ok: true, total: list.length, group_by: groupBy, groups: Object.fromEntries(sorted) }),
      executedToolName: "analyze_contacts",
    };
  }

  if (name === "generate_letter") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const recipient_name = String(raw.recipient_name ?? "");
    const recipient_title = String(raw.recipient_title ?? "");
    const recipient_ministry = String(raw.recipient_ministry ?? "");
    const subject = String(raw.subject ?? "");
    const issue_description = String(raw.issue_description ?? "");
    const citizen_name = String(raw.citizen_name ?? "");
    const letter_type = String(raw.letter_type ?? "αίτηση");
    if (!recipient_name || !subject || !issue_description) {
      return { content: JSON.stringify({ error: "Υποχρεωτικά: recipient_name, subject, issue_description" }) };
    }
    const sys = `Είσαι πολιτική γραμματέας. Γράψε επίσημη επιστολή στα ελληνικά. Τύπος: ${letter_type}. Χώρος: Αιτωλοακαρνανία. Μόνο το κείμενο επιστολής, χωρίς προλόγια.`;
    const user = `Προς: ${recipient_name}${recipient_title ? ", " + recipient_title : ""}${recipient_ministry ? " — " + recipient_ministry : ""}\nΘέμα: ${subject}\nΖήτημα: ${issue_description}\nΠολίτης/αναφορά: ${citizen_name || "—"}\nΥπογραφή: placeholder βουλευτή.`;
    const out = await anthropicComplete(sys, user);
    if (!out.ok) {
      return { content: JSON.stringify({ error: out.error }) };
    }
    return { content: JSON.stringify({ ok: true, letter: out.text }), executedToolName: "generate_letter" };
  }

  if (name === "generate_press_release") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const topic = String(raw.topic ?? "");
    const key_points = Array.isArray(raw.key_points) ? raw.key_points.map((x) => String(x)) : [];
    const tone = String(raw.tone ?? "επίσημο");
    if (!topic) {
      return { content: JSON.stringify({ error: "Υποχρεωτικό topic" }) };
    }
    const sys = `Σύνταξε ανακοίνωση τύπου στα ελληνικά, τόνος: ${tone}. Βουλευτής Αιτωλοακαρνανίας. Μόνο το κείμενο.`;
    const user = `Θέμα: ${topic}\nΒασικά σημεία:\n${key_points.map((k, i) => `${i + 1}. ${k}`).join("\n")}`;
    const out = await anthropicComplete(sys, user);
    if (!out.ok) {
      return { content: JSON.stringify({ error: out.error }) };
    }
    return { content: JSON.stringify({ ok: true, press_release: out.text }), executedToolName: "generate_press_release" };
  }

  if (name === "generate_social_post") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const topic = String(raw.topic ?? "");
    const platform = String(raw.platform ?? "facebook");
    const tone = String(raw.tone ?? "επίσημο");
    const include_hashtags = raw.include_hashtags === true;
    if (!topic) {
      return { content: JSON.stringify({ error: "Υποχρεωτικό topic" }) };
    }
    const sys = `Δημιούργησε post social media στα ελληνικά. Πλατφόρμα: ${platform}. Ύφος: ${tone}.${include_hashtags ? " Συμπέρασε 3–5 hashtags." : " Χωρίς hashtags."} Σύντομα, 1–3 παράγραφοι.`;
    const out = await anthropicComplete(sys, topic);
    if (!out.ok) {
      return { content: JSON.stringify({ error: out.error }) };
    }
    return { content: JSON.stringify({ ok: true, post: out.text, platform }), executedToolName: "generate_social_post" };
  }

  if (name === "bulk_send_nameday_wishes") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const ymd = raw.date != null && /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) ? String(raw.date) : todayYmdAthens();
    const d = new Date(ymd + "T12:00:00");
    let ids = await getContactIdsForNameDay(ctx.supabase, d.getMonth() + 1, d.getDate());
    const municipality = raw.municipality != null ? String(raw.municipality).trim() : "";
    if (municipality && ids.length > 0) {
      const { data: rows, error: e2 } = await ctx.supabase
        .from("contacts")
        .select("id")
        .in("id", ids)
        .ilike("municipality", `%${municipality}%`);
      if (e2) {
        return { content: JSON.stringify({ error: e2.message }) };
      }
      ids = (rows ?? []).map((x) => (x as { id: string }).id);
    }
    if (ids.length === 0) {
      return { content: JSON.stringify({ ok: false, message: "Καμία επαφή για αυτό το εορτολόγιο/δήμο." }) };
    }
    const r = await ctx.forward("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Ευχές ονομαστικής ${ymd}`,
        description: `Καμπάνια αυτόματη (Αλεξάνδρα)${municipality ? ` — ${municipality}` : ""}`,
        contact_ids: ids,
      }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; campaign?: { id: string }; assigned_contacts?: number };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα καμπάνιας" }) };
    }
    return {
      content: JSON.stringify({
        ok: true,
        campaign_id: j.campaign?.id,
        contact_count: j.assigned_contacts ?? ids.length,
        message: "Η καμπάνια ευχών δημιουργήθηκε. Ξεκινήστε κλήσεις από τη σελίδα καμπανιών.",
      }),
      executedToolName: "bulk_send_nameday_wishes",
    };
  }

  if (name === "find_contacts_not_called") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const muni = raw.municipality != null ? String(raw.municipality).trim() : "";
    const limit = Math.min(500, Math.max(1, Number(raw.limit) || 200));
    const onlyNever = raw.days_ago === 0;
    const days = onlyNever
      ? 0
      : Math.min(365, Math.max(1, parseInt(String(raw.days_ago ?? 30), 10) || 30));
    let q = ctx.supabase
      .from("contacts")
      .select("id, first_name, last_name, phone, municipality, last_contacted_at");
    if (onlyNever) {
      q = q.is("last_contacted_at", null);
    } else {
      const cut = new Date();
      cut.setDate(cut.getDate() - days);
      const iso = cut.toISOString();
      q = q.or(`last_contacted_at.is.null,last_contacted_at.lt."${iso}"`);
    }
    if (muni) {
      q = q.ilike("municipality", `%${muni}%`);
    }
    q = q.order("created_at", { ascending: false }).limit(4000);
    const { data, error } = await q;
    if (error) {
      return { content: JSON.stringify({ error: error.message }) };
    }
    const rows = (data ?? []).slice(0, limit) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      phone: string;
      municipality: string | null;
    }>;
    return {
      content: JSON.stringify({
        ok: true,
        filter: onlyNever ? "never_called" : { days_ago: days },
        count: rows.length,
        contacts: rows,
      }),
      findResults: rows as unknown as FindRow[],
      executedToolName: "find_contacts_not_called",
    };
  }

  if (name === "analyze_document") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const text = String(raw.text ?? "");
    const q = raw.question != null ? String(raw.question) : "";
    const docType = String(raw.document_type ?? "έγγραφο");
    if (!text.trim()) {
      return { content: JSON.stringify({ error: "Χρειάζεται text" }) };
    }
    const user = `Τύπος: ${docType}.\n\nΚείμενο:\n${text}\n\n${q ? "Ερώτηση: " + q : "Ζητούμενο: περίληψη, 5+ κύρια σημεία, σημασία για Αιτωλοακαρνανία."}`;
    const out = await anthropicComplete(
      "Είσαι νομικός αναλυτής. Απαντάς πάντα στα ελληνικά, δομημένα: Περίληψη, Κύρια σημεία, Σχέση με Αιτωλοακαρνανία.",
      user,
    );
    if (!out.ok) {
      return { content: JSON.stringify({ error: out.error }) };
    }
    return { content: JSON.stringify({ ok: true, analysis: out.text }), executedToolName: "analyze_document" };
  }

  if (name === "morning_briefing") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const r = await ctx.forward("/api/briefing/today", { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return { content: JSON.stringify({ error: (j as { error?: string }).error || "Σφάλμα briefing" }) };
    }
    let narrative: string | undefined;
    const narrativeOut = await anthropicComplete(
      "Είσαι η Αλεξάνδρα, γραμματέας βουλευτή. Γράψε 2-3 σύντομες προτάσεις στα ελληνικά που συνοψίζουν την ημέρα: κλήσεις χθες, σημαντικά αιτήματα, εκδηλώσεις, εργασίες. Μόνο το κείμενο, χωρίς bullets.",
      `Σημερινό briefing (JSON):\n${JSON.stringify(j).slice(0, 12_000)}`,
      { model: SUMMARY_MODEL, maxTokens: 150 },
    );
    if (narrativeOut.ok) {
      narrative = narrativeOut.text.trim();
    }
    return {
      content: JSON.stringify({ ok: true, narrative, briefing: j }),
      executedToolName: "morning_briefing",
    };
  }

  if (name === "calculate_scores") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο υπεύθυνοι (manager) μπορούν να υπολογίσουν σκορ" }) };
    }
    const r = await ctx.forward("/api/contacts/calculate-scores", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { error?: string; updated?: number; total?: number };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα υπολογισμού σκορ" }) };
    }
    return {
      content: JSON.stringify({ ok: true, updated: j.updated, total: j.total }),
      executedToolName: "calculate_scores",
    };
  }

  if (name === "generate_content") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο υπεύθυνοι (manager)" }) };
    }
    const genType = raw.type as string | undefined;
    const params = raw.params;
    if (!genType || params == null || typeof params !== "object" || Array.isArray(params)) {
      return { content: JSON.stringify({ error: "Χρειάζονται type (press_release|social_post|letter) και params (object)" }) };
    }
    const r = await ctx.forward("/api/content/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: genType, params }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; content?: string; type?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα δημιουργίας" }) };
    }
    return {
      content: JSON.stringify({ ok: true, type: j.type ?? genType, content: j.content ?? "" }),
      executedToolName: "generate_content",
    };
  }

  if (name === "translate_text") {
    const text = String(raw.text ?? "").trim();
    const to = String(raw.to_language ?? "el");
    const from = String(raw.from_language ?? "auto");
    if (!text) {
      return { content: JSON.stringify({ error: "Κενό κείμενο" }) };
    }
    const out = await anthropicComplete(
      `Μετάφρασε στα ${to}. Αν from_language=${from}, αναγνώρισε πηγή. Μόνο το αποτέλεσμα, χωρίς σχόλια.`,
      text.slice(0, 20_000),
    );
    if (!out.ok) {
      return { content: JSON.stringify({ error: out.error }) };
    }
    return { content: JSON.stringify({ ok: true, translated: out.text }), executedToolName: "translate_text" };
  }

  if (name === "search_media") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const q = String(raw.query ?? "Καραγκούνης").trim();
    const r = await ctx.forward(`/api/media/search?q=${encodeURIComponent(q)}`, { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as { error?: string; results?: unknown[] };
    if (!r.ok) {
      return { content: JSON.stringify({ error: (j as { error?: string }).error || "Σφάλμα" }) };
    }
    return { content: JSON.stringify({ ok: true, results: j.results ?? [] }), executedToolName: "search_media" };
  }

  if (name === "add_event_rsvp") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const eventId = String(raw.event_id ?? "").trim();
    const contactId = pickContactId(raw.contact_id, ctx);
    if (!eventId || !contactId) {
      return { content: JSON.stringify({ error: "Χρειάζονται event_id και contact_id" }) };
    }
    const r = await ctx.forward(`/api/events/${eventId}/rsvps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, status: "Επιβεβαιωμένος" }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    return { content: JSON.stringify({ ok: true, id: j.id }), executedToolName: "add_event_rsvp" };
  }

  if (name === "get_volunteer_list") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const area = raw.area != null ? String(raw.area).trim() : "";
    const q = area ? `?volunteer_area=${encodeURIComponent(area)}` : "";
    const r = await ctx.forward(`/api/volunteers${q}`, { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as { error?: string; volunteers?: unknown[] };
    if (!r.ok) {
      return { content: JSON.stringify({ error: (j as { error?: string }).error || "Σφάλμα" }) };
    }
    return { content: JSON.stringify({ ok: true, volunteers: j.volunteers ?? [] }), executedToolName: "get_volunteer_list" };
  }

  if (name === "get_contact_summary") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const contact_id = pickContactId(raw.contact_id, ctx);
    if (!contact_id) {
      return { content: JSON.stringify({ error: "Χρειάζεται contact_id" }) };
    }
    const g = await ctx.forward(`/api/contacts/${contact_id}/ai-summary`, { method: "GET" });
    const j = (await g.json().catch(() => ({}))) as { summary?: string | null; error?: string };
    if (g.ok && j.summary) {
      return { content: JSON.stringify({ ok: true, summary: j.summary, cached: true }), executedToolName: "get_contact_summary" };
    }
    const p = await ctx.forward(`/api/contacts/${contact_id}/ai-summary`, { method: "POST" });
    const j2 = (await p.json().catch(() => ({}))) as { summary?: string; error?: string };
    if (!p.ok) {
      return { content: JSON.stringify({ error: j2.error || "Σφάλμα AI" }) };
    }
    return { content: JSON.stringify({ ok: true, summary: j2.summary, cached: false }), executedToolName: "get_contact_summary" };
  }

  if (name === "get_todays_call_list") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const r = await ctx.forward("/api/data-tools/predictive-list", { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as {
      list?: Array<{
        rank: number;
        first_name: string;
        last_name: string;
        score: number;
        breakdown: { reason: string; points: number }[];
      }>;
      empty?: boolean;
    };
    if (!r.ok) {
      return { content: JSON.stringify({ error: "Σφάλμα API" }) };
    }
    const list = j.list ?? [];
    const expl = list
      .map(
        (row) =>
          `#${row.rank} ${row.first_name} ${row.last_name} (σκορ ${row.score}): ${(row.breakdown ?? []).map((b) => `${b.reason} (${b.points})`).join(", ")}`,
      )
      .join("\n");
    return {
      content: JSON.stringify({ ok: true, list, explanation: expl || "Άδεια λίστα — δημιουργήστε από /data-tools." }),
      executedToolName: "get_todays_call_list",
    };
  }

  if (name === "get_analytics") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const r = await ctx.forward("/api/analytics", { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return { content: JSON.stringify({ error: (j.error as string) || "Σφάλμα" }) };
    }
    const kpis = j.kpis as Record<string, unknown> | undefined;
    const summary = kpis
      ? `Επαφές: ${kpis.totalContacts}, νέες 30ημ.: ${kpis.newContacts30d}, θετικοί %: ${kpis.positivePercent}, ολοκλ. αιτήματα: ${kpis.completedRequests}`
      : "Αναλυτικά φορτώθηκαν.";
    return {
      content: JSON.stringify({ ok: true, summary, kpis: j.kpis ?? null }),
      executedToolName: "get_analytics",
    };
  }

  if (name === "create_event") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const title = String(raw.title ?? "").trim();
    const date = String(raw.date ?? "").trim();
    if (!title || !date) {
      return { content: JSON.stringify({ error: "Χρειάζονται title, date" }) };
    }
    const body = {
      title,
      date,
      location: raw.location != null ? String(raw.location) : null,
      type: raw.type != null ? String(raw.type) : "Εκδήλωση",
      description: raw.description != null ? String(raw.description) : null,
    };
    const r = await ctx.forward("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    return { content: JSON.stringify({ ok: true, event_id: j.id }), executedToolName: "create_event" };
  }

  if (name === "get_events") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const r = await ctx.forward("/api/events", { method: "GET" });
    const j = (await r.json().catch(() => ({}))) as { events?: unknown[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j.error || "Σφάλμα" }) };
    }
    let ev = (j.events ?? []) as Array<{ date?: string }>;
    if (raw.upcoming === true) {
      const today = todayYmdAthens();
      ev = ev.filter((e) => (e.date ?? "").slice(0, 10) >= today);
    }
    return {
      content: JSON.stringify({ ok: true, count: ev.length, events: ev.slice(0, 50) }),
      executedToolName: "get_events",
    };
  }

  if (name === "create_poll") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const optsIn = Array.isArray(raw.options) ? (raw.options as unknown[]) : [];
    const texts = optsIn.map((x) => String(x).trim()).filter(Boolean);
    if (texts.length < 2) {
      return { content: JSON.stringify({ error: "Τουλάχιστον 2 επιλογές" }) };
    }
    const options = texts.map((t, i) => ({ id: `opt-${i + 1}`, text: t }));
    const payload = {
      title: String(raw.title ?? "").trim(),
      question: String(raw.question ?? "").trim(),
      options,
      target_group_id: raw.target_group_id != null ? String(raw.target_group_id) : null,
      ends_at: raw.ends_at != null ? String(raw.ends_at) : null,
    };
    if (!payload.title || !payload.question) {
      return { content: JSON.stringify({ error: "Χρειάζονται title, question" }) };
    }
    const r = await ctx.forward("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j2 = (await r.json().catch(() => ({}))) as { error?: string; poll?: { id: string } };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j2.error || "Σφάλμα" }) };
    }
    const pid = j2.poll?.id;
    return { content: JSON.stringify({ ok: true, poll_id: pid }), executedToolName: "create_poll" };
  }

  if (name === "get_poll_results") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const pid = String(raw.poll_id ?? "").trim();
    if (!pid) {
      return { content: JSON.stringify({ error: "poll_id" }) };
    }
    const r = await ctx.forward(`/api/polls/${pid}`, { method: "GET" });
    const j3 = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return { content: JSON.stringify({ error: (j3.error as string) || "Σφάλμα" }) };
    }
    return { content: JSON.stringify({ ok: true, ...j3 }), executedToolName: "get_poll_results" };
  }

  if (name === "start_campaign") {
    if (!permLegacy("alexandra_tool_start_campaign", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η εκκίνηση καμπάνιας για αυτόν τον ρόλο" }) };
    }
    const cid = String(raw.campaign_id ?? "").trim();
    if (!cid) {
      return { content: JSON.stringify({ error: "campaign_id" }) };
    }
    const r = await ctx.forward(`/api/campaigns/${cid}/dial-next`, { method: "POST" });
    const j4 = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return { content: JSON.stringify({ error: (j4.error as string) || "Σφάλμα" }) };
    }
    return { content: JSON.stringify({ ok: true, ...j4 }), executedToolName: "start_campaign" };
  }

  if (name === "search_municipalities") {
    const query = String(raw.query ?? "").trim();
    if (!query) {
      return { content: JSON.stringify({ error: "Χρειάζεται query (όνομα δήμου)" }) };
    }
    try {
      const matches = await searchMunicipalities(ctx.supabase, query);
      return {
        content: JSON.stringify({
          ok: true,
          query,
          count: matches.length,
          municipalities: matches.map((m) => ({
            name: m.name,
            regional_unit: m.regional_unit,
          })),
        }),
        executedToolName: "search_municipalities",
      };
    } catch (e) {
      return {
        content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα αναζήτησης δήμων" }),
      };
    }
  }

  if (name === "export_contacts") {
    if (!permLegacy("alexandra_tool_export_contacts", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η εξαγωγή για αυτόν τον ρόλο" }) };
    }
    const fl = (raw.filters as Record<string, unknown>) || {};
    const formatRaw = String(raw.format ?? "excel").toLowerCase();
    const format = formatRaw === "csv" ? "csv" : "excel";
    const fieldsRaw = Array.isArray(raw.fields) ? (raw.fields as unknown[]).map(String) : [];
    const exportFields = fieldsRaw.length ? fieldsRaw : [...DEFAULT_EXPORT_FIELDS];
    const filenameBase =
      String(raw.filename ?? "").trim().replace(/[^\w.\- ()\u0370-\u03FF]+/g, "_").slice(0, 120) ||
      `epafes_${todayYmdAthens()}`;

    const { contacts, error: fetchErr, resolvedMunicipalities, municipalityQueries } =
      await fetchContactsForExport(ctx, fl, 50_000);
    if (fetchErr) {
      return { content: JSON.stringify({ error: fetchErr }) };
    }
    const { headers, rows } = buildExportRows(contacts as Record<string, unknown>[], exportFields);
    try {
      const stored = await buildAlexandraExportMatrix(ctx.userId, headers, rows, filenameBase, format, "Επαφές");
      const preview = rows.slice(0, 3).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""])));
      return {
        content: JSON.stringify({
          ok: true,
          download_url: stored.download_url,
          count: contacts.length,
          format: stored.format,
          fields: exportFields,
          preview,
          ...(resolvedMunicipalities?.length
            ? { resolved_municipalities: resolvedMunicipalities, municipality_queries: municipalityQueries }
            : {}),
          message: `Εξήχθησαν ${contacts.length} επαφές (${stored.format}). Κατέβασε το αρχείο από τον παρακάτω σύνδεσμο.`,
        }),
        executedToolName: "export_contacts",
      };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα εξαγωγής" }) };
    }
  }

  if (name === "generate_import_template") {
    if (!permLegacy("alexandra_import", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η δημιουργία προτύπου για αυτόν τον ρόλο" }) };
    }
    const formatRaw = String(raw.format ?? "excel").toLowerCase();
    const format = formatRaw === "csv" ? "csv" : "excel";
    const includeExamples = raw.include_examples !== false;
    const template = buildImportTemplateAoa(includeExamples);
    try {
      const filename = `protipo_eisagogis_${todayYmdAthens()}`;
      const payload = { aoa: template.aoa, sheetName: template.sheetName };
      if (format === "csv") {
        const stored = await buildAlexandraCsv(ctx.userId, payload, filename, { bom: true });
        return {
          content: JSON.stringify({
            ok: true,
            download_url: stored.download_url,
            format: "CSV",
            message: "Δημιουργήθηκε πρότυπο εισαγωγής (CSV). Κατέβασέ το και συμπλήρωσέ το πριν το ανεβάσεις ξανά.",
          }),
          executedToolName: "generate_import_template",
        };
      }
      const stored = await buildAlexandraExcel(ctx.userId, payload, filename, { sheetName: template.sheetName });
      return {
        content: JSON.stringify({
          ok: true,
          download_url: stored.download_url,
          format: "Excel",
          message: "Δημιουργήθηκε πρότυπο εισαγωγής (Excel). Κατέβασέ το και συμπλήρωσέ το πριν το ανεβάσεις ξανά.",
        }),
        executedToolName: "generate_import_template",
      };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα προτύπου" }) };
    }
  }

  if (name === "get_documents") {
    if (!isMgr) {
      return { content: JSON.stringify({ error: "Μόνο manager" }) };
    }
    const cid = raw.contact_id != null ? String(raw.contact_id).trim() : "";
    const path = cid ? `/api/documents?contact_id=${encodeURIComponent(cid)}` : "/api/documents";
    const r = await ctx.forward(path, { method: "GET" });
    const j5 = (await r.json().catch(() => ({}))) as { documents?: unknown[]; error?: string };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j5.error || "Σφάλμα" }) };
    }
    const docs = (j5.documents ?? []) as object[];
    return {
      content: JSON.stringify({ ok: true, count: docs.length, documents: docs.slice(0, 15) }),
      executedToolName: "get_documents",
    };
  }

  if (name === "bulk_update_status") {
    if (!permLegacy("alexandra_tool_bulk_update_contacts", isMgr)) {
      return { content: JSON.stringify({ error: "Δεν επιτρέπεται η μαζική ενημέρωση για αυτόν τον ρόλο" }) };
    }
    const ids = Array.isArray(raw.contact_ids) ? (raw.contact_ids as unknown[]).map((x) => String(x).trim()).filter(Boolean) : [];
    const status = String(raw.status ?? "").trim();
    if (!ids.length || !["Pending", "Positive", "Negative", "No Answer"].includes(status)) {
      return { content: JSON.stringify({ error: "Άκυρα contact_ids ή status" }) };
    }
    const r = await ctx.forward("/api/contacts/manager-bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: ids.slice(0, 5000), fields: { call_status: status } }),
    });
    const j6 = (await r.json().catch(() => ({}))) as { error?: string; updated?: number; failed?: number };
    if (!r.ok) {
      return { content: JSON.stringify({ error: j6.error || "Σφάλμα" }) };
    }
    return {
      content: JSON.stringify({ ok: true, updated: j6.updated ?? 0, failed: j6.failed ?? 0 }),
      executedToolName: "bulk_update_status",
    };
  }

  if (name === "generate_pdf") {
    const title = String(raw.title ?? "").trim() || "Έγγραφο";
    const content = String(raw.content ?? "");
    const docType = raw.type != null ? String(raw.type).trim() : undefined;
    try {
      const buf = await buildAlexandraPdf(title, content, docType);
      const safeTitle = title.replace(/[^\w.\- ()\u0370-\u03FF]+/g, "_").slice(0, 80) || "document";
      const stored = await storeAlexandraExport(ctx.userId, `${safeTitle}.pdf`, buf, "application/pdf");
      return {
        content: JSON.stringify({ ok: true, download_url: stored.download_url, path: stored.path }),
        executedToolName: "generate_pdf",
      };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα PDF" }) };
    }
  }

  if (name === "generate_excel") {
    const filename = String(raw.filename ?? "export").trim() || "export";
    try {
      const stored = await buildAlexandraExcel(ctx.userId, raw.data, filename);
      return {
        content: JSON.stringify({ ok: true, download_url: stored.download_url, path: stored.path }),
        executedToolName: "generate_excel",
      };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα Excel" }) };
    }
  }

  if (name === "generate_csv") {
    const filename = String(raw.filename ?? "export").trim() || "export";
    try {
      const stored = await buildAlexandraCsv(ctx.userId, raw.data, filename);
      return {
        content: JSON.stringify({ ok: true, download_url: stored.download_url, path: stored.path }),
        executedToolName: "generate_csv",
      };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα CSV" }) };
    }
  }

  if (name === "run_analysis") {
    const type = String(raw.type ?? "").trim();
    if (!type) {
      return { content: JSON.stringify({ error: "Χρειάζεται type" }) };
    }
    try {
      const result = await runAlexandraAnalysis(ctx.supabase, type, raw.data);
      return { content: JSON.stringify(result), executedToolName: "run_analysis" };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα ανάλυσης" }) };
    }
  }

  if (name === "get_weather") {
    const city = String(raw.city ?? "").trim();
    try {
      const result = await fetchWeatherForCity(city);
      return { content: JSON.stringify(result), executedToolName: "get_weather" };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα καιρού" }) };
    }
  }

  if (name === "get_news") {
    const query = String(raw.query ?? "").trim();
    try {
      const result = await fetchNews(query);
      return { content: JSON.stringify(result), executedToolName: "get_news" };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα νέων" }) };
    }
  }

  if (name === "get_sports") {
    const sport = String(raw.sport ?? "").trim();
    const query = String(raw.query ?? "").trim();
    try {
      const result = await fetchSports(sport, query);
      return { content: JSON.stringify(result), executedToolName: "get_sports" };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα αθλητικών" }) };
    }
  }

  if (name === "scrape_url") {
    const url = String(raw.url ?? "").trim();
    if (!url) {
      return { content: JSON.stringify({ error: "Χρειάζεται url" }) };
    }
    try {
      const result = await scrapePublicUrl(url);
      return { content: JSON.stringify({ ok: true, ...result }), executedToolName: "scrape_url" };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα URL" }) };
    }
  }

  if (name === "political_research") {
    const subject = String(raw.subject ?? "").trim();
    const researchType = String(raw.research_type ?? "").trim() as PoliticalResearchType;
    const validTypes = new Set([
      "news",
      "statements",
      "votes",
      "comparison",
      "local_impact",
      "social_media",
      "full_profile",
    ]);
    if (!subject) {
      return { content: JSON.stringify({ error: "Χρειάζεται subject" }) };
    }
    if (!validTypes.has(researchType)) {
      return { content: JSON.stringify({ error: "Άκυρος research_type" }) };
    }
    const timeRangeRaw = raw.time_range != null ? String(raw.time_range) : "week";
    const validRanges = new Set(["today", "week", "month", "all"]);
    const time_range = validRanges.has(timeRangeRaw)
      ? (timeRangeRaw as "today" | "week" | "month" | "all")
      : "week";
    try {
      const result = await runPoliticalResearch(
        {
          subject,
          research_type: researchType,
          time_range,
          compare_with_kostas: raw.compare_with_kostas === true,
        },
        { isManager: isMgr },
      );
      return { content: JSON.stringify(result), executedToolName: "political_research" };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα πολιτικής έρευνας" }) };
    }
  }

  if (name === "political_daily_briefing") {
    const focus = raw.focus != null ? String(raw.focus).trim() : undefined;
    try {
      const result = await runPoliticalDailyBriefing({ focus: focus || undefined }, { isManager: isMgr });
      return { content: JSON.stringify(result), executedToolName: "political_daily_briefing" };
    } catch (e) {
      return { content: JSON.stringify({ error: e instanceof Error ? e.message : "Σφάλμα ημερήσιου briefing" }) };
    }
  }

  return { content: JSON.stringify({ error: "Άγνωστο tool" }) };
}

export function buildPageContextBlock(ctx: AlexandraPageContext | null | undefined): string {
  if (!ctx) return "Αρχική σελίδα";

  switch (ctx.type) {
    case "contact":
      return `Σελίδα επαφής: ${ctx.contactName} (ID: ${ctx.contactId}). Μπορείς να χρησιμοποιείς αυτό το contact_id αυτόματα.`;
    case "request":
      return `Σελίδα αιτήματος: "${ctx.requestTitle}" - Κατάσταση: ${ctx.requestStatus} (ID: ${ctx.requestId}). Μπορείς να αναφέρεσαι σε αυτό το αίτημα απευθείας — χρησιμοποίησε request_id=${ctx.requestId} όταν χρειάζεται.`;
    case "contacts_list":
      return `Σελίδα λίστας επαφών${ctx.totalCount != null ? ` (${ctx.totalCount} επαφές συνολικά)` : ""}. Μπορείς να κάνεις αναζητήσεις και φιλτράρισμα.`;
    case "requests_list":
      return `Σελίδα λίστας αιτημάτων${ctx.totalCount != null ? ` (${ctx.totalCount} αιτήματα συνολικά)` : ""}. Μπορείς να αναζητήσεις και να διαχειριστείς αιτήματα.`;
    case "campaign":
      return `Σελίδα καμπάνιας: "${ctx.campaignName}" - Κατάσταση: ${ctx.status} (ID: ${ctx.campaignId}).`;
    case "dashboard":
      return "Dashboard. Μπορείς να δείξεις στατιστικά, πρωινή ενημέρωση, ή γρήγορες ενέργειες.";
    case "analytics":
      return "Σελίδα αναλυτικών. Μπορείς να αναλύσεις δεδομένα και να δείξεις KPIs.";
    case "tasks":
      return "Σελίδα εργασιών. Μπορείς να δημιουργήσεις, επεξεργαστείς ή ολοκληρώσεις εργασίες.";
    case "events":
      return "Σελίδα εκδηλώσεων. Μπορείς να δημιουργήσεις εκδηλώσεις και να διαχειριστείς RSVPs.";
    case "volunteers":
      return "Σελίδα εθελοντών. Μπορείς να δείξεις και να διαχειριστείς εθελοντές.";
    case "settings":
      return "Σελίδα ρυθμίσεων CRM.";
    case "namedays":
      return "Σελίδα εορτολογίου. Μπορείς να δείξεις ποιος γιορτάζει σήμερα ή άλλη μέρα.";
    default:
      return "Γενική σελίδα CRM.";
  }
}

export type SystemPromptBuildOpts = {
  todayDate: string;
  pageContextBlock: string;
  memoriesBlock: string;
  role: string;
};

export function buildSystemPrompt({
  todayDate,
  pageContextBlock,
  memoriesBlock,
  role,
}: SystemPromptBuildOpts) {
  return `Είσαι η Αλεξάνδρα, η AI γραμματέας του βουλευτή Κώστα Καραγκούνη (Νέα Δημοκρατία, Αιτωλοακαρνανία).

ΤΑΥΤΟΤΗΤΑ:
- Έμπειρη πολιτική γραμματέας — έξυπνη, αποφασιστική, αξιόπιστη
- Μιλάς ΠΑΝΤΑ Ελληνικά. Ποτέ Αγγλικά
- Είσαι σύντομη και συγκεκριμένη — max 3 προτάσεις εκτός αν ζητηθεί περισσότερο
- Έχεις πρόσβαση στο internet για real-time πληροφορίες

ΔΥΝΑΤΟΤΗΤΕΣ CRM:
Επαφές: αναζήτηση, δημιουργία, επεξεργασία, σημειώσεις, μαζικές ενέργειες
Αιτήματα: δημιουργία, παρακολούθηση, ενημέρωση κατάστασης
Εργασίες: δημιουργία, ανάθεση, παρακολούθηση
Καμπάνιες: εκκίνηση κλήσεων, παρακολούθηση αποτελεσμάτων
Εκδηλώσεις: δημιουργία, RSVP διαχείριση
Εθελοντές: προβολή και διαχείριση
Δημοσκοπήσεις: δημιουργία και αποτελέσματα
Έγγραφα: προβολή και ανάλυση
Αναλυτικά: στατιστικά και KPIs
Εορτολόγιο: εύρεση επαφών που γιορτάζουν
Εξαγωγή: CSV/Excel/PDF αρχεία
Περιεχόμενο: γράμματα, δελτία τύπου, social posts
Μνήμη: αποθήκευση και ανάκτηση πληροφοριών

ΚΑΝΟΝΕΣ:
- Χρησιμοποίησε tools ΑΜΕΣΩΣ για απλές ενέργειες χωρίς να ρωτάς άδεια
- Για διαγραφές/μαζικές ενέργειες: ανακοίνωσε τι θα κάνεις και περίμενε επιβεβαίωση
- Μετά από tool: επιβεβαίωσε με συγκεκριμένα στοιχεία (αριθμοί, ονόματα)
- Αν tool αποτύχει: εξήγησε το error συγκεκριμένα
- ΠΟΤΕ μη λες "δεν μπορώ" — βρες πάντα τρόπο
- Αν είσαι σε σελίδα επαφής, χρησιμοποίησε αυτόματα το contact_id της τρέχουσας επαφής
- Αν είσαι σε σελίδα αιτήματος, χρησιμοποίησε αυτόματα το request_id του τρέχοντος αιτήματος

ΕΞΑΓΩΓΗ ΔΕΔΟΜΕΝΩΝ:
- Πριν κάνεις export με φίλτρο δήμου, χρησιμοποίησε search_municipalities για να βρεις την ακριβή ονομασία στη βάση (μην εφευρίσκεις επίσημο όνομα δήμου).
- «Εξάγαγε όλες τις επαφές από Βόνιτσα» → search_municipalities(query=Βόνιτσα), μετά export_contacts με municipalities από το αποτέλεσμα (ή municipality=Βόνιτσα — το export επιλύει αυτόματα).
- «Εξάγαγε όλες τις επαφές από Αγρίνιο» → search_municipalities(query=Αγρίνιο), μετά export_contacts
- «Δώσε μου Excel με τους θετικούς» → export_contacts με φίλτρο call_status=Positive, format=excel
- «Θέλω CSV με ονοματεπώνυμο και τηλέφωνο μόνο» → export_contacts με fields [last_name, first_name, phone], format=csv
- «Εξάγαγε ομάδα ΕΚΛΟΓΕΣ 2023» → export_contacts με φίλτρο group/ομάδα
Χρησιμοποίησε ΠΑΝΤΑ το export_contacts tool για εξαγωγές, όχι get_all_contacts.
Ρώτα για format (Excel/CSV) αν δεν έχει ειπωθεί — default Excel.

ΕΙΣΑΓΩΓΗ ΔΕΔΟΜΕΝΩΝ:
Όταν ο χρήστης ανεβάσει αρχείο ή ζητήσει import:
- Αυτόματα αναγνώρισε τις στήλες (detectColumns / smart_excel_import χωρίς mapping)
- Πάντα κάλεσε smart_excel_import πρώτα με confirmed=false για preview
- Χειρίσου διπλότυπα — ρώτα: παράλειψη ή ενημέρωση
- Αν κάτι είναι ασαφές, ρώτα πριν εισάγεις
- Μετά την εισαγωγή, πες πόσες επαφές μπήκαν και αν υπήρξαν προβλήματα
- Για πρότυπο εισαγωγής: generate_import_template
- Ποτέ μη δημιουργείς επαφή χωρίς όνομα (first_name) και τηλέφωνο

ΠΟΛΙΤΙΚΗ ΕΡΕΥΝΑ & ΑΝΑΛΥΣΗ:
"Όταν ο χρήστης ζητά πληροφορίες για άλλους βουλευτές ή πολιτικά κόμματα:
1. Χρησιμοποίησε web_search με queries όπως '[όνομα βουλευτή] δηλώσεις', '[όνομα] βουλή ψηφοφορία', '[όνομα] νέα σήμερα'
2. Κάνε ΠΑΝΤΑ τουλάχιστον 3 διαφορετικές αναζητήσεις για να έχεις πλήρη εικόνα
3. Σύγκρινε τις θέσεις τους με τις θέσεις του Κώστα Καραγκούνη όπου είναι σχετικό
4. Παρουσίασε τα ευρήματα αναλυτικά: τι είπε, πότε, πού, και τι σημαίνει πολιτικά
5. Επισήμανε αν υπάρχουν αντιφάσεις ή αλλαγές θέσεων
6. Πρότεινε πώς ο Κώστας μπορεί να αξιοποιήσει αυτές τις πληροφορίες

Για παρακολούθηση αντιπάλων:
- Ψάξε πρόσφατες δηλώσεις (τελευταίες 7 ημέρες)
- Ψάξε ψηφοφορίες στη Βουλή
- Ψάξε τοπικά νέα που αφορούν την Αιτωλοακαρνανία
- Ψάξε social media posts (Twitter/Facebook)
- Σύγκρινε με τις θέσεις της ΝΔ και του Κώστα"

Χρησιμοποίησε το tool political_research για δομημένη έρευνα αντιπάλων/κομμάτων· συμπλήρωσε με web_search για live αποτελέσματα.
Για πλήρες ημερήσιο briefing (τύπος, Βουλή, αντίπαλοι, social): χρησιμοποίησε political_daily_briefing.

Για interview/ομιλία prep: όταν ο χρήστης αναφέρει ότι έχει συνέντευξη ή ομιλία για κάποιο θέμα, αυτόματα κάνε political research για το θέμα, μάζεψε επιχειρήματα, και φτιάξε briefing με: α) κύρια μηνύματα, β) πιθανές ερωτήσεις, γ) απαντήσεις.

ΣΗΜΕΡΑ: ${todayDate}
ΤΡΕΧΟΥΣΑ ΣΕΛΙΔΑ: ${pageContextBlock}
ΜΝΗΜΗ: ${memoriesBlock}
ΡΟΛΟΣ ΧΡΗΣΤΗ: ${role}

Είσαι proactive: όταν ο χρήστης ολοκληρώνει μια ενέργεια, πρότεινε το επόμενο λογικό βήμα. Π.χ. μετά από εξαγωγή επαφών → πρότεινε καμπάνια. Μετά από δημιουργία επαφής → πρότεινε προσθήκη αιτήματος. Μετά από ανάλυση → πρότεινε ενέργεια βάσει αποτελεσμάτων.
`;
}

export function historyToClaude(
  history: { role: "user" | "assistant"; content: string }[],
): MessageParam[] {
  return history.map((h) => ({ role: h.role, content: h.content }));
}
