"use client";

import { Upload } from "lucide-react";
import clsx from "clsx";
import type { DragEvent, ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { lux } from "@/lib/luxury-styles";

type Props = {
  id: string;
  name?: string;
  accept?: string;
  disabled?: boolean;
  onFiles: (files: FileList | null) => void;
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
};

export function HqFileDropzone({ id, name, accept, disabled, onFiles, label, hint, className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      onFiles(e.dataTransfer.files?.length ? e.dataTransfer.files : null);
    },
    [disabled, onFiles],
  );

  return (
    <div className={clsx("space-y-2", className)}>
      {label != null && (
        <label htmlFor={id} className={lux.label}>
          {label}
        </label>
      )}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        className={clsx(
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--input-bg)]/50 px-4 py-10 text-center transition",
          dragOver && "border-[var(--accent-gold)] bg-[var(--accent-gold)]/5",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Upload className="h-10 w-10 text-[var(--accent-gold)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">
          Σύρετε αρχεία εδώ <span className="font-medium text-[var(--text-primary)]">ή κάντε κλικ</span>
        </p>
        {hint != null && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          accept={accept}
          className="sr-only"
          disabled={disabled}
          multiple
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>
    </div>
  );
}
