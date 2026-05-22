import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline";
  size?: "default" | "sm";
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={clsx(
        "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variant === "outline" && "border bg-transparent",
        variant === "default" && "border border-transparent bg-primary text-primary-foreground",
        size === "sm" && "h-8 rounded-md px-3 text-xs",
        size === "default" && "h-9 rounded-md px-4 py-2 text-sm",
        className
      )}
      {...props}
    />
  );
}
