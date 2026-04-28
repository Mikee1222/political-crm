import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";

/**
 * Η αρχική διαδρομή οδηγεί στο dashboard (από εκεί το middleware/ρόλος καθορίζει τελικό προορισμό, π.χ. caller → επαφές).
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && isInvalidRefreshTokenError(error)) {
    await supabase.auth.signOut();
    redirect("/login");
  }
  if (!user) {
    redirect("/login");
  }
  redirect("/dashboard");
}
