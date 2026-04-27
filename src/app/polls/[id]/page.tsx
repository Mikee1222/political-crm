"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { lux } from "@/lib/luxury-styles";
import { hasMinRole } from "@/lib/roles";
import { useProfile } from "@/contexts/profile-context";

type Poll = {
  id: string;
  title: string;
  question: string;
  options: { id: string; text: string }[];
  status: string;
};

export default function PollDetailPage() {
  const { id } = useParams();
  const pid = typeof id === "string" ? id : "";
  const { profile } = useProfile();
  const can = hasMinRole(profile?.role, "manager");
  const [poll, setPoll] = useState<Poll | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [resN, setResN] = useState(0);

  const load = useCallback(async () => {
    const r = await fetchWithTimeout(`/api/polls/${pid}`);
    const j = (await r.json().catch(() => ({}))) as { poll?: Poll; option_counts?: Record<string, number>; responses?: unknown[] };
    if (r.ok && j.poll) {
      setPoll(j.poll);
      setCounts(j.option_counts ?? {});
      setResN((j.responses as unknown[] | undefined)?.length ?? 0);
    }
  }, [pid]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async () => {
    if (!confirm("Αποστολή συνδέσμων;")) return;
    await fetchWithTimeout(`/api/polls/${pid}/send`, { method: "POST" });
  };

  if (!can) {
    return <p className="p-6">Δεν επιτρέπεται.</p>;
  }

  if (!poll) {
    return <p className="p-6">Φόρτωση…</p>;
  }

  const max = Math.max(1, ...Object.values(counts), 0);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Link href="/polls" className={lux.btnSecondary + " inline-flex w-fit !text-sm"}>
        ← Πίσω
      </Link>
      <h1 className="text-xl font-bold">{poll.title}</h1>
      <p className="text-[var(--text-secondary)]">{poll.question}</p>
      <p className="text-xs text-[var(--text-muted)]">Σύνολο απαντήσεων: {resN}</p>
      <button type="button" className={lux.btnPrimary} onClick={() => void send()}>
        Αποστολή
      </button>
      <ul className="mt-4 space-y-2">
        {poll.options.map((o) => (
          <li key={o.id} className="rounded-lg border border-[var(--border)] p-2">
            <p className="text-sm font-medium">{o.text}</p>
            <div className="mt-1 h-2 w-full max-w-md overflow-hidden rounded bg-[var(--bg-elevated)]">
              <div
                className="h-full bg-[#003476]/80"
                style={{ width: `${Math.round((100 * (counts[o.id] ?? 0)) / max)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">{counts[o.id] ?? 0}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
