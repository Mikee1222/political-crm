import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Η αρχική διαδρομή οδηγεί στο dashboard (από εκεί το middleware/ρόλος καθορίζει τελικό προορισμό, π.χ. caller → επαφές).
 */
export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }
  redirect("/dashboard");
}
