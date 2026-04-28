"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";

type ToastVariant = "success" | "error";

type ToastItem = { id: string; message: string; variant: ToastVariant };

type Ctx = {
  showToast: (message: string, variant: ToastVariant) => void;
};

const FormToastContext = createContext<Ctx | null>(null);

export function useFormToast(): Ctx {
  const v = useContext(FormToastContext);
  if (!v) {
    return {
      showToast: () => {
        /* no-op outside provider */
      },
    };
  }
  return v;
}

export function FormToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastVariant) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <FormToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-4 z-[10050] flex flex-col items-center gap-2 px-4 sm:top-6"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={clsx(
              "pointer-events-auto max-w-[min(480px,calc(100vw-2rem))] rounded-xl border px-4 py-3 text-center text-sm font-medium shadow-lg max-lg:transition-shadow",
              t.variant === "success" &&
                "hq-success-flash border-emerald-500/40 bg-emerald-950/90 text-emerald-100 [data-theme='light']:bg-emerald-50 [data-theme='light']:text-emerald-900",
              t.variant === "error" &&
                "hq-shake-error border-red-500/40 bg-red-950/90 text-red-100 [data-theme='light']:bg-red-50 [data-theme='light']:text-red-900",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </FormToastContext.Provider>
  );
}
