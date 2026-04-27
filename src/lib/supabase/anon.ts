import { createClient } from "@supabase/supabase-js";

/** Unauthenticated / public data reads (e.g. published news). */
export const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
