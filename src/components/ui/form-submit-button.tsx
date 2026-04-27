"use client";

import { Loader2 } from "lucide-react";
import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { lux } from "@/lib/luxury-styles";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  children: ReactNode;
  variant?: "gold" | "ghost";
};

export function FormSubmitButton({
  loading,
  children,
  variant = "gold",
  className,
  disabled,
  type = "submit",
  ...rest
}: Props) {
  const base = variant === "gold" ? lux.btnPrimary : lux.btnSecondary;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(base, "min-h-[42px]", className)}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>Φόρτωση…</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
