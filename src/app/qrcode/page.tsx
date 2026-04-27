"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { useProfile } from "@/contexts/profile-context";
import { hasMinRole } from "@/lib/roles";

export default function QrCodePage() {
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [url, setUrl] = useState("");
  const [size, setSize] = useState(256);
  const [withFooter, setWithFooter] = useState(true);
  const [img, setImg] = useState<string | null>(null);

  useEffect(() => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    setUrl(`${base}/portal/register`);
  }, []);

  const refresh = useCallback(() => {
    if (!url.trim()) return;
    setImg(`/api/qrcode?url=${encodeURIComponent(url)}&size=${size}&t=${Date.now()}`);
  }, [url, size]);

  useEffect(() => {
    if (url) {
      void refresh();
    }
  }, [url, size, refresh]);

  if (!can) {
    return (
      <div className="p-6">
        <p className="text-sm text-amber-200">Δεν έχετε πρόσβαση.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className={lux.card}>
        <h1 className={lux.pageTitle}>QR Code</h1>
        <p className="text-sm text-[var(--text-secondary)]">Για εγγραφή portal και άλλα URLs.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className={lux.label} htmlFor="u">
              URL
            </label>
            <input id="u" className={lux.input} value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div>
            <label className={lux.label} htmlFor="s">
              Μέγεθος (px)
            </label>
            <input
              id="s"
              type="number"
              min={128}
              max={512}
              className={lux.input}
              value={size}
              onChange={(e) => setSize(parseInt(e.target.value, 10) || 256)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input type="checkbox" checked={withFooter} onChange={(e) => setWithFooter(e.target.checked)} />
            Υπόμνημα εκτύπωσης
          </label>
        </div>
        <div className="mt-6 flex flex-col items-center gap-4">
          {img && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={img} alt="QR" className="h-auto max-w-full border border-[var(--border)] bg-white p-2" />
          )}
          {withFooter && (
            <p className="max-w-md text-center text-sm text-[var(--text-secondary)]">
              Σκανάρετε για να επικοινωνήσετε με το γραφείο μας
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <a
              href={img ?? "#"}
              download="qrcode.png"
              className={lux.btnPrimary + " !text-sm"}
              onClick={async (e) => {
                if (!url.trim()) e.preventDefault();
                const r = await fetchWithTimeout(img ?? "");
                const b = await r.blob();
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = "qrcode.png";
                a.click();
              }}
            >
              Λήψη PNG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
