"use client";

import { useCallback, useEffect, useState } from "react";
import { lux } from "@/lib/luxury-styles";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { HqLabel } from "@/components/ui/hq-form-primitives";

type SocialSettings = {
  id: number;
  show_tiktok: boolean;
  show_facebook: boolean;
  show_instagram: boolean;
  instagram_follower_label: string | null;
  updated_at?: string;
};

type SocialPost = {
  id: string;
  platform: "tiktok" | "facebook";
  url: string;
  active: boolean;
  sort_order: number;
  created_at: string;
};

export function SocialMediaSettingsSection() {
  const [settings, setSettings] = useState<SocialSettings | null>(null);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [url, setUrl] = useState("");
  const [platform, setPlatform] = useState<"tiktok" | "facebook">("tiktok");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    const [rs, rp] = await Promise.all([
      fetchWithTimeout("/api/admin/portal-social-settings"),
      fetchWithTimeout("/api/admin/social-posts"),
    ]);
    if (rs.ok) {
      const j = (await rs.json()) as { settings: SocialSettings | null };
      if (j.settings) setSettings(j.settings);
      else
        setSettings({
          id: 1,
          show_tiktok: true,
          show_facebook: true,
          show_instagram: true,
          instagram_follower_label: null,
        });
    } else {
      setErr("Δεν φορτώθηκαν οι ρυθμίσεις.");
    }
    if (rp.ok) {
      const j2 = (await rp.json()) as { posts: SocialPost[] };
      setPosts(j2.posts ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async (next: Partial<SocialSettings>) => {
    if (!settings) return;
    setSaving(true);
    setErr(null);
    const body = {
      show_tiktok: next.show_tiktok ?? settings.show_tiktok,
      show_facebook: next.show_facebook ?? settings.show_facebook,
      show_instagram: next.show_instagram ?? settings.show_instagram,
      instagram_follower_label:
        next.instagram_follower_label !== undefined
          ? next.instagram_follower_label
          : settings.instagram_follower_label,
    };
    const res = await fetchWithTimeout("/api/admin/portal-social-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setErr("Αποτυχία αποθήκευσης.");
      return;
    }
    const j = (await res.json()) as { settings: SocialSettings };
    setSettings(j.settings);
  };

  const addPost = async () => {
    const u = url.trim();
    if (!u) {
      setErr("Εισάγετε URL.");
      return;
    }
    setAdding(true);
    setErr(null);
    const res = await fetchWithTimeout("/api/admin/social-posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, url: u, sort_order: 0, active: true }),
    });
    setAdding(false);
    if (!res.ok) {
      setErr("Αποτυχία προσθήκης.");
      return;
    }
    setUrl("");
    await load();
  };

  const remove = async (id: string) => {
    if (!window.confirm("Διαγραφή;")) return;
    setErr(null);
    const res = await fetchWithTimeout(`/api/admin/social-posts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setErr("Αποτυχία διαγραφής.");
      return;
    }
    await load();
  };

  if (!settings) {
    return (
      <section className={lux.card}>
        <h2 className={lux.pageTitle + " mb-1"}>Social Media (portal)</h2>
        <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>
      </section>
    );
  }

  return (
    <section className={lux.card}>
      <div className="mb-4">
        <h2 className={lux.pageTitle + " mb-1"}>Social Media (portal)</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          Διαχείριση embed στο /portal — έως 3 ενεργά TikTok και 3 Facebook ανά platform (ταξινόμηση με
          `sort_order` στη βάση). Instagram: μόνο σύνδεσμος και εμφάνιση.
        </p>
      </div>
      {err && (
        <p className="mb-3 text-sm text-amber-200" role="status">
          {err}
        </p>
      )}

      <div className="mb-6 space-y-3 rounded-lg border border-[var(--border)] p-4">
        <p className="text-sm font-semibold text-[var(--text-primary)]">Ενότητες portal</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={settings.show_tiktok}
              onChange={(e) => {
                setSettings((s) => (s ? { ...s, show_tiktok: e.target.checked } : s));
                void saveSettings({ show_tiktok: e.target.checked });
              }}
              disabled={saving}
            />
            Εμφάνιση TikTok
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={settings.show_facebook}
              onChange={(e) => {
                setSettings((s) => (s ? { ...s, show_facebook: e.target.checked } : s));
                void saveSettings({ show_facebook: e.target.checked });
              }}
              disabled={saving}
            />
            Εμφάνιση Facebook
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={settings.show_instagram}
              onChange={(e) => {
                setSettings((s) => (s ? { ...s, show_instagram: e.target.checked } : s));
                void saveSettings({ show_instagram: e.target.checked });
              }}
              disabled={saving}
            />
            Εμφάνιση Instagram
          </label>
        </div>
        <div>
          <HqLabel>Κείμενο ακόλουθων Instagram (π.χ. «12Κ ακόλουθοι») — προαιρετικό</HqLabel>
          <div className="mt-1 flex max-w-md flex-col gap-2 sm:flex-row">
            <input
              className={lux.input}
              value={settings.instagram_follower_label ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setSettings((s) => (s ? { ...s, instagram_follower_label: v } : s));
              }}
              onBlur={(e) => {
                const t = e.target.value.trim();
                const label = t === "" ? null : t;
                void saveSettings({ instagram_follower_label: label });
              }}
              disabled={saving}
              placeholder="Κενό = χωρίς εμφάνιση"
            />
            <button
              type="button"
              className={lux.btnSecondary + " shrink-0"}
              onClick={() => {
                const t = (settings.instagram_follower_label ?? "").trim();
                void saveSettings({ instagram_follower_label: t === "" ? null : t });
              }}
              disabled={saving}
            >
              Αποθήκευση κειμένου
            </button>
          </div>
        </div>
      </div>

      <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">TikTok / Facebook URLs</p>
      <div className="mb-4 flex max-w-2xl flex-col gap-2 sm:flex-row">
        <select
          className={lux.select + " sm:w-40"}
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "tiktok" | "facebook")}
        >
          <option value="tiktok">TikTok</option>
          <option value="facebook">Facebook</option>
        </select>
        <input
          className={lux.input + " min-w-0 flex-1"}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
        <button type="button" className={lux.btnPrimary + " shrink-0"} onClick={addPost} disabled={adding}>
          Προσθήκη
        </button>
      </div>
      <div className="w-full min-w-0 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className={lux.tableHead + " border-b border-[var(--border)]"}>
              <th className="p-3 pl-4 text-left">Πλατφόρμα</th>
              <th className="p-3 text-left">URL</th>
              <th className="p-3 pr-4 text-right">Ενέργειες</th>
            </tr>
          </thead>
          <tbody>
            {posts.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-[var(--text-secondary)]">
                  Δεν έχετε προσθέσει ακόμα.
                </td>
              </tr>
            )}
            {posts.map((p) => (
              <tr key={p.id} className="border-b border-[var(--border)] last:border-0">
                <td className="p-3 pl-4 font-medium uppercase">{p.platform}</td>
                <td className="max-w-[1px] p-3 break-all text-[var(--text-secondary)]">{p.url}</td>
                <td className="p-3 pr-4 text-right">
                  <button type="button" className={lux.btnSecondary + " !py-1"} onClick={() => void remove(p.id)}>
                    Διαγραφή
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
