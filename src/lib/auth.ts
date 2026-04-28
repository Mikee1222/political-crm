import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isInvalidRefreshTokenError } from "@/lib/supabase/auth-errors";

export async function requireUser() {
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
  return user;
}
