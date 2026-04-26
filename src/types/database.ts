export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      contacts: {
        Row: {
          id: string;
          first_name: string;
          last_name: string;
          phone: string;
          email: string | null;
          address: string | null;
          area: string | null;
          age: number | null;
          gender: string | null;
          occupation: string | null;
          source: string | null;
          tags: string[] | null;
          priority: string | null;
          political_stance: string | null;
          influence: boolean | null;
          call_status: string | null;
          notes: string | null;
          last_contacted_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["contacts"]["Row"]> & {
          first_name: string;
          last_name: string;
          phone: string;
        };
        Update: Partial<Database["public"]["Tables"]["contacts"]["Row"]>;
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          started_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["campaigns"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Row"]>;
      };
      calls: {
        Row: {
          id: string;
          contact_id: string;
          campaign_id: string | null;
          called_at: string | null;
          duration_seconds: number | null;
          outcome: string | null;
          transferred_to_politician: boolean | null;
          notes: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["calls"]["Row"]> & { contact_id: string };
        Update: Partial<Database["public"]["Tables"]["calls"]["Row"]>;
      };
      tasks: {
        Row: {
          id: string;
          contact_id: string;
          title: string;
          due_date: string | null;
          completed: boolean;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & {
          contact_id: string;
          title: string;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
