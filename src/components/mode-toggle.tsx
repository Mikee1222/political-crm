"use client";

import { Moon, Sun } from "lucide-react";
import { applyCrmTheme, useCrmTheme } from "@/components/theme-provider";

export function ModeToggle() {
  const { theme } = useCrmTheme();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => applyCrmTheme(dark ? "light" : "dark")}
      className="rounded-md border px-3 py-2 text-sm"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
