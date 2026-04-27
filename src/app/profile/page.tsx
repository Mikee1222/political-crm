"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { useProfile } from "@/contexts/profile-context";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { PageHeader } from "@/components/ui/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { mergePreferences, type UserPreferences } from "@/lib/user-preferences";

function sectionCard(title: string, children: ReactNode) {
  return (
    <section className={lux.card + " !p-5"}>
      <h2 className={lux.sectionTitle + " mb-4 border-b border-[var(--border)]/60 pb-2"}>{title}</h2>
      {children}
    </section>
  );
}

export default function ProfilePage() {
  const { profile, loading, refresh } = useProfile();
  const { setTheme, resolvedTheme } = useTheme();
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newEmail2, setNewEmail2] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [lang, setLang] = useState<"el" | "en">("el");
  const [notif, setNotif] = useState({ email: true, push: true, sms: false });
  const [prefBusy, setPrefBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFullName(profile.full_name ?? "");
    const p = mergePreferences(profile.preferences ?? null, null);
    setLang(p.language === "en" ? "en" : "el");
    setNotif({
      email: p.notifications?.email !== false,
      push: p.notifications?.push !== false,
      sms: p.notifications?.sms === true,
    });
    if (p.theme) setTheme(p.theme);
  }, [profile, setTheme]);

  useEffect(() => {
    if (lang) {
      try {
        document.documentElement.lang = lang;
      } catch {
        // ignore
      }
    }
  }, [lang]);

  const savePersonal = useCallback(async () => {
    setErr(null);
    setOk(null);
    setSaving(true);
    try {
      const res = await fetchWithTimeout("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ full_name: fullName || null }),
        timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setOk("Αποθηκεύτηκε");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [fullName, refresh]);

  const savePreferences = useCallback(async () => {
    setErr(null);
    setOk(null);
    setPrefBusy(true);
    try {
      const prefs: Partial<UserPreferences> = {
        language: lang,
        theme: (resolvedTheme === "light" ? "light" : "dark") as "light" | "dark",
        notifications: { ...notif },
      };
      const res = await fetchWithTimeout("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ preferences: prefs }),
        timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setOk("Οι προτιμήσεις αποθηκεύτηκαν");
      await refresh();
    } finally {
      setPrefBusy(false);
    }
  }, [lang, notif, refresh, resolvedTheme]);

  const changeEmail = useCallback(async () => {
    setErr(null);
    setOk(null);
    setEmailBusy(true);
    try {
      const res = await fetchWithTimeout("/api/profile/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ newEmail: newEmail, confirm: newEmail2 }),
        timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setOk(j.message ?? "Αιτήμα email εστάλη");
      setNewEmail("");
      setNewEmail2("");
    } finally {
      setEmailBusy(false);
    }
  }, [newEmail, newEmail2]);

  const changePassword = useCallback(async () => {
    setErr(null);
    setOk(null);
    setPwBusy(true);
    try {
      const res = await fetchWithTimeout("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword: curPw, newPassword: newPw, confirm: newPw2 }),
        timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Σφάλμα");
        return;
      }
      setOk("Ο κωδικός άλλαξε");
      setCurPw("");
      setNewPw("");
      setNewPw2("");
    } finally {
      setPwBusy(false);
    }
  }, [curPw, newPw, newPw2]);

  const onAvatar = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setErr(null);
      setOk(null);
      setAvatarUploading(true);
      try {
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetchWithTimeout("/api/profile/avatar", { method: "POST", body: fd, credentials: "same-origin" });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setErr(j.error ?? "Αποτυχία μεταφόρτωσης");
          return;
        }
        setOk("Η φωτογραφία ενημερώθηκε");
        await refresh();
      } finally {
        setAvatarUploading(false);
      }
    },
    [refresh],
  );

  if (loading && !profile) {
    return <p className="text-sm text-[var(--text-secondary)]">Φόρτωση…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <PageHeader
        title="Προφίλ"
        subtitle="Ρυθμίσεις λογαριασμού, ασφάλειας και εμφάνισης"
      />
      {err && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p>}
      {ok && <p className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{ok}</p>}

      {sectionCard(
        "Προσωπικά στοιχεία",
        <div className="space-y-3">
          <div>
            <label className={lux.label} htmlFor="p-name">
              Ονοματεπώνυμο
            </label>
            <input
              id="p-name"
              className={lux.input}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div>
            <p className={lux.label}>Email (εμφάνιση)</p>
            <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm text-[var(--text-primary)]">
              {profile?.email ?? "—"}
            </p>
          </div>
          <button type="button" className={lux.btnPrimary} onClick={() => void savePersonal()} disabled={saving}>
            {saving ? "Αποθήκευση…" : "Αποθήκευση στοιχείων"}
          </button>
        </div>,
      )}

      {sectionCard(
        "Φωτογραφία προφίλ",
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {profile?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user storage URL
            <img
              src={profile.avatar_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-[var(--accent-gold)]/50"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-gold)]/40 to-[var(--accent-blue)]/40 text-lg font-bold text-white">
              {(fullName || profile?.full_name || "ΚΚ")
                .split(/\s+/)
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
          )}
          <div>
            <input id="p-avatar" type="file" className="sr-only" accept="image/*" onChange={onAvatar} />
            <label htmlFor="p-avatar" className={lux.btnSecondary + " inline-flex !cursor-pointer"}>
              {avatarUploading ? "Μεταφόρτωση…" : "Επιλογή αρχείου"}
            </label>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">PNG, JPG έως 2MB · αποθήκευση στον χώρο avatars</p>
          </div>
        </div>,
      )}

      {sectionCard(
        "Αλλαγή email",
        <div className="space-y-3">
          <div>
            <p className={lux.label}>Τρέχον</p>
            <p className="text-sm text-[var(--text-primary)]">{profile?.email ?? "—"}</p>
          </div>
          <div>
            <label className={lux.label} htmlFor="p-e1">
              Νέο email
            </label>
            <input id="p-e1" type="email" className={lux.input} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
          <div>
            <label className={lux.label} htmlFor="p-e2">
              Επιβεβαίωση
            </label>
            <input id="p-e2" type="email" className={lux.input} value={newEmail2} onChange={(e) => setNewEmail2(e.target.value)} />
          </div>
          <button
            type="button"
            className={lux.btnPrimary}
            onClick={() => void changeEmail()}
            disabled={emailBusy}
          >
            {emailBusy ? "Υποβολή…" : "Υποβολή αλλαγής email"}
          </button>
        </div>,
      )}

      {sectionCard(
        "Αλλαγή κωδικού",
        <div className="space-y-3">
          <div>
            <label className={lux.label} htmlFor="p-c1">
              Τρέχον κωδικός
            </label>
            <input
              id="p-c1"
              type="password"
              className={lux.input}
              autoComplete="current-password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="p-c2">
              Νέος κωδικός
            </label>
            <input
              id="p-c2"
              type="password"
              className={lux.input}
              autoComplete="new-password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <div>
            <label className={lux.label} htmlFor="p-c3">
              Επιβεβαίωση νέου
            </label>
            <input
              id="p-c3"
              type="password"
              className={lux.input}
              autoComplete="new-password"
              value={newPw2}
              onChange={(e) => setNewPw2(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={lux.btnPrimary}
            onClick={() => void changePassword()}
            disabled={pwBusy}
          >
            {pwBusy ? "Αποθήκευση…" : "Ενημέρωση κωδικού"}
          </button>
        </div>,
      )}

      {sectionCard(
        "Προτιμήσεις",
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-[var(--text-primary)]">Θέμα (σκοτεινό / ανοιχτό)</span>
            <ThemeToggle />
            <p className="w-full text-xs text-[var(--text-secondary)]">Μετά το κλικ, πατήστε αποθήκευση για απομνημόνευση στις προτιμήσεις.</p>
          </div>
          <div>
            <label className={lux.label} htmlFor="p-lng">
              Γλώσσα διεπαφής
            </label>
            <select
              id="p-lng"
              className={lux.select}
              value={lang}
              onChange={(e) => setLang(e.target.value as "el" | "en")}
            >
              <option value="el">Ελληνικά</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="space-y-2">
            <p className={lux.label}>Ειδοποιήσεις (τύποι)</p>
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-[var(--border)]"
                checked={notif.email}
                onChange={(e) => setNotif((n) => ({ ...n, email: e.target.checked }))}
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-[var(--border)]"
                checked={notif.push}
                onChange={(e) => setNotif((n) => ({ ...n, push: e.target.checked }))}
              />
              Push
            </label>
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-[var(--border)]"
                checked={notif.sms}
                onChange={(e) => setNotif((n) => ({ ...n, sms: e.target.checked }))}
              />
              SMS
            </label>
          </div>
          <button type="button" className={lux.btnPrimary} onClick={() => void savePreferences()} disabled={prefBusy}>
            {prefBusy ? "Αποθήκευση…" : "Αποθήκευση προτιμήσεων"}
          </button>
        </div>,
      )}
    </div>
  );
}
