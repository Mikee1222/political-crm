"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { lux } from "@/lib/luxury-styles";

export function LogoutButton({
  className = "",
  variant = "default",
}: {
  className?: string;
  variant?: "default" | "icon";
}) {
  const router = useRouter();

  const onLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onLogout}
        className={[
          "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition",
          "hover:bg-red-500/15 hover:text-red-400 active:scale-95",
          className,
        ].join(" ")}
        title="Αποσύνδεση"
        aria-label="Αποσύνδεση"
      >
        <LogOut className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      className={[lux.btnSecondary, "gap-2 !border-[var(--border)] !py-2.5 text-sm", className].join(" ")}
    >
      <LogOut className="h-4 w-4" />
      <span>Αποσύνδεση</span>
    </button>
  );
}
