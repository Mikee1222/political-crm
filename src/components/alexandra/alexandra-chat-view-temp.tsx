"use client";

import Link from "next/link";
import { Menu, Send, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { hasMinRole, type Role } from "@/lib/roles";
import { useProfile } from "@/contexts/profile-context";
import type { ActionPayload } from "@/lib/ai-assistant-actions";
import { fetchWithTimeout } from "@/lib/client-fetch";
import { callStatusLabel, callStatusPill } from "@/lib/luxury-styles";
import { CenteredModal } from "@/components/ui/centered-modal";

const SUGGESTED: string[] = [
  "Τι έχω για σήμερα;",
  "Ποιοι γιορτάζουν αυτή την εβδομάδα;",
  "Δείξε μου τους αναποφάσιστους",
  "Ποια αιτήματα είναι εκκρεμή;",
  "Βρες μου επαφές από το Αγρίνιο",
  "Τι tasks έχω;",
];

type FindRow = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  call_status: string | null;
};

type StoredAssistantAction = {
  parsed?: ActionPayload | null;
  findResults?: FindRow[];
  toolsExecuted?: string[];
  executed?: boolean;
  startCallMeta?: { name: string; phone: string } | null;
} | null;

type StreamMeta = { executed: string[]; confirmCall?: { contact_id: string; name: string; phone: string } };

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  contextLabel?: string;
  pendingAction?: ActionPayload | null;
  executed?: boolean;
  findResults?: FindRow[] | null;
  startCallMeta?: { name: string; phone: string } | null;
  /** Από server action blob (persisted) */
  toolsExecutedFromDb?: string[] | null;
  /** Ζωντανά κατά streaming */
  isStreaming?: boolean;
  streamMeta?: StreamMeta | null;
};

function greekToolLabel(t: string) {
  const m: Record<string, string> = {
    find_contacts: "Αναζήτηση επαφών",
    update_contact_status: "Κατάσταση κλήσης",
    add_task: "Εργασία",
    create_request: "Αίτημα",
    add_note: "Σημείωση",
    get_contact_details: "Λεπτομέρειες",
    get_stats: "Στατιστικά",
    start_call: "Κλήση",
  };
  return m[t] ?? t;
}

type RowConv = { id: string; title: string; updated_at: string };

function initialsName(first: string, last: string) {
  return `${(first?.[0] ?? "?").toUpperCase()}${(last?.[0] ?? "?").toUpperCase()}`;
}

function canExecuteAction(role: Role | null | undefined, a: ActionPayload) {
  if (a.action === "find_contacts") return false;
  if (a.action === "update_status") return true;
  return hasMinRole(role, "manager");
}

function canConfirmStartCall(role: Role | null | undefined, a: ActionPayload) {
  return a.action === "start_call" && hasMinRole(role, "manager");
}

function canConfirmCreate(role: Role | null | undefined, a: ActionPayload) {
  return a.action === "create_contact" && hasMinRole(role, "manager");
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("el-GR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function mapDbToMsg(row: {
  id: string;
  role: string;
  content: string;
  action: unknown;
  context_label: string | null;
  created_at: string;
}): Msg & { _createdAt: string } {
  if (row.role === "user") {
    return {
      id: row.id,
      role: "user" as const,
      content: row.content,
      _createdAt: row.created_at,
    };
  }
  const st = row.action as StoredAssistantAction;
  return {
    id: row.id,
    role: "assistant" as const,
    content: row.content,
    contextLabel: row.context_label ?? undefined,
    pendingAction: st?.parsed ?? null,
    executed: st?.executed,
    findResults: st?.findResults,
    startCallMeta: st?.startCallMeta,
    toolsExecutedFromDb: st?.toolsExecuted ?? null,
    _createdAt: row.created_at,
  };
}

type MsgWithT = Msg & { _createdAt?: string };

export function AlexandraApp() {
  const { profile } = useProfile();
  const [conversations, setConversations] = useState<RowConv[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MsgWithT[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<RowConv | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  /** none | typing (πριν το 1ο token) | streaming (εμφάνιση κειμένου) */
  const [streamMode, setStreamMode] = useState<"none" | "typing" | "streaming">("none");
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendInFlight = useRef(false);
  const role = profile?.role;
  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetchWithTimeout("/api/ai-conversations");
      const data = (await res.json()) as { conversations?: RowConv[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Σφάλμα");
        return;
      }
      setConversations(data.conversations ?? []);
    } catch {
      setError("Σφάλμα δικτύου");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadMessages = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setMessagesLoading(true);
      setError(null);
      try {
        const res = await fetchWithTimeout(`/api/ai-conversations/${id}/messages`);
        const data = (await res.json()) as {
          messages?: Array<{
            id: string;
            role: string;
            content: string;
            action: unknown;
            context_label: string | null;
            created_at: string;
          }>;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error || "Σφάλμα");
          return;
        }
        const arr = (data.messages ?? []).map((row) => mapDbToMsg(row));
        setMessages(arr);
      } catch {
        setError("Σφάλμα δικτύου");
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedId) {
      void loadMessages(selectedId);
    } else {
      setMessages([]);
    }
  }, [selectedId, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, streamMode, scrollToBottom]);

  const newConversation = useCallback(async (): Promise<string | null> => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/ai-conversations", { method: "POST" });
      const data = (await res.json()) as { id?: string; title?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error || "Σφάλμα");
        return null;
      }
      setConversations((c) => [
        { id: data.id!, title: data.title ?? "Νέα συνομιλία", updated_at: new Date().toISOString() },
        ...c,
      ]);
      setSelectedId(data.id);
      return data.id;
    } catch {
      setError("Σφάλμα δικτύου");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteConv = useCallback(
    async (c: RowConv) => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetchWithTimeout(`/api/ai-conversations/${c.id}`, { method: "DELETE" });
        const _data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(_data.error || "Σφάλμα");
          return;
        }
        setConversations((list) => list.filter((x) => x.id !== c.id));
        if (selectedId === c.id) {
          setSelectedId(null);
          setMessages([]);
        }
      } catch {
        setError("Σφάλμα δικτύου");
      } finally {
        setLoading(false);
        setToDelete(null);
      }
    },
    [selectedId],
  );

  const execute = useCallback(async (messageId: string) => {
    const target = messagesRef.current.find((x) => x.id === messageId);
    const action = target?.pendingAction;
    if (!action) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/ai-assistant/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        setError(data.error || "Αποτυχία");
        return;
      }
      setMessages((m) =>
        m.map((row) =>
          row.id === messageId
            ? {
                ...row,
                content: row.content + `\n\n*${String((data as { message?: string }).message || "Έγινε")}*`,
                pendingAction: null,
                executed: true,
              }
            : row,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Σφάλμα");
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(
    async (raw: string, overrideId?: string | null) => {
      const text = raw.trim();
      const convId = overrideId ?? selectedId;
      if (!text || !convId || sendInFlight.current) return;
      setError(null);
      setInput("");

      const optimisticId = `local-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())}`;
      const sentAt = new Date().toISOString();
      setMessages((m) => [...m, { id: optimisticId, role: "user" as const, content: text, _createdAt: sentAt }]);

      sendInFlight.current = true;
      setStreamMode("typing");
      setLoading(true);
      const streamAssistId = `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const parseSse = async (res: Response) => {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("Άκυρο stream");
        const dec = new TextDecoder();
        let rest = "";
        const ensureAssistant = () => {
          setStreamMode("streaming");
          setLoading(false);
          setMessages((m) => {
            if (m.some((x) => x.id === streamAssistId)) return m;
            return [
              ...m,
              {
                id: streamAssistId,
                role: "assistant" as const,
                content: "",
                isStreaming: true,
                streamMeta: { executed: [] },
                _createdAt: new Date().toISOString(),
              },
            ];
          });
        };
        type SseJ = {
          token?: string;
          event?: string;
          error?: string;
          tool?: string;
          name?: string;
          contact_id?: string;
          phone?: string;
        };
        /* eslint-disable no-constant-condition */
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          rest += dec.decode(value, { stream: true });
          const parts = rest.split("\n\n");
          rest = parts.pop() ?? "";
          for (const part of parts) {
            if (!part.startsWith("data: ")) continue;
            const dataStr = part.slice(6);
            if (dataStr === "[DONE]") {
              return;
            }
            let j: SseJ;
            try {
              j = JSON.parse(dataStr) as SseJ;
            } catch {
              continue;
            }
            if (j.error) {
              throw new Error(String(j.error));
            }
            if (j.token) {
              setStreamMode("streaming");
              setLoading(false);
              setMessages((m) => {
                const has = m.some((x) => x.id === streamAssistId);
                if (!has) {
                  return [
                    ...m,
                    {
                      id: streamAssistId,
                      role: "assistant" as const,
                      content: j.token!,
                      isStreaming: true,
                      streamMeta: { executed: [] },
                      _createdAt: new Date().toISOString(),
                    },
                  ];
                }
                return m.map((row) =>
                  row.id === streamAssistId
                    ? { ...row, content: row.content + (j.token ?? "") }
                    : row,
                );
              });
            } else if (j.event === "executed" && j.tool) {
              ensureAssistant();
              setMessages((m) =>
                m.map((row) => {
                  if (row.id !== streamAssistId) return row;
                  const prev = row.streamMeta?.executed ?? [];
                  if (prev.includes(String(j.tool))) return row;
                  return {
                    ...row,
                    streamMeta: { ...row.streamMeta, executed: [...prev, String(j.tool)] } as StreamMeta,
                  };
                }),
              );
            } else if (j.event === "confirm_call" && j.contact_id) {
              ensureAssistant();
              setMessages((m) =>
                m.map((row) =>
                  row.id === streamAssistId
                    ? {
                        ...row,
                        streamMeta: {
                          executed: row.streamMeta?.executed ?? [],
                          confirmCall: {
                            contact_id: j.contact_id!,
                            name: j.name || "",
                            phone: j.phone || "—",
                          },
                        } as StreamMeta,
                        pendingAction: { action: "start_call" as const, contact_id: j.contact_id! },
                        startCallMeta: { name: j.name || "", phone: j.phone || "—" },
                      }
                    : row,
                ),
              );
            }
          }
        }
        /* eslint-enable no-constant-condition */
      };
      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ message: text, conversationId: convId }),
        });
        if (!res.ok) {
          const t = await res.text();
          let msg = "Σφάλμα";
          try {
            const j = JSON.parse(t) as { error?: string };
            if (j.error) msg = j.error;
          } catch {
            msg = t.slice(0, 200) || msg;
          }
          throw new Error(msg);
        }
        const type = res.headers.get("content-type");
        if (!type?.includes("text/event-stream")) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (j.error) throw new Error(j.error);
          throw new Error("Μη αναμενόμενη απάντηση");
        }
        await parseSse(res);
        setMessages((m) =>
          m.map((row) => (row.id === streamAssistId ? { ...row, isStreaming: false } : row)),
        );
        setStreamMode("none");
        await loadMessages(convId, { silent: true });
        await loadList();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Σφάλμα δικτύου");
        setMessages((m) => m.filter((x) => x.id !== optimisticId && x.id !== streamAssistId));
        setStreamMode("none");
      } finally {
        setLoading(false);
        sendInFlight.current = false;
        setStreamMode("none");
        setMessages((m) =>
          m.map((row) => (row.isStreaming ? { ...row, isStreaming: false } : row)),
        );
      }
    },
    [selectedId, loadMessages, loadList],
  );

  const startWithChip = useCallback(
    async (text: string) => {
      const id = await newConversation();
      if (id) await send(text, id);
    },
    [newConversation, send],
  );

  const confirmStartCall = useCallback(async (messageId: string) => {
    const t = messagesRef.current.find((x) => x.id === messageId);
    if (t?.pendingAction?.action !== "start_call") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/ai-assistant/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: t.pendingAction }),
      });
      const j = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setError(j.error || "Σφάλμα");
        return;
      }
      setMessages((m) =>
        m.map((row) =>
          row.id === messageId
            ? { ...row, content: row.content + `\n\n*${j.message || "Η κλήση ξεκίνησε."}*`, pendingAction: null, startCallMeta: null, executed: true }
            : row,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Σφάλμα");
    } finally {
      setLoading(false);
    }
  }, []);

  const rejectStartCall = useCallback((messageId: string) => {
    setMessages((m) => m.map((row) => (row.id === messageId ? { ...row, pendingAction: null, startCallMeta: null } : row)));
  }, []);

  const rejectCreate = useCallback((messageId: string) => {
    setMessages((m) => m.map((row) => (row.id === messageId ? { ...row, pendingAction: null } : row)));
  }, []);

  const selectConversation = useCallback((id: string) => {
    setSelectedId(id);
    setSideOpen(false);
  }, []);

  const currentTitle = selectedId
    ? (conversations.find((c) => c.id === selectedId)?.title ?? "Συνομιλία")
    : "";

  const isEmpty = messages.length === 0;
  const showChips = Boolean(selectedId && isEmpty && !loading && streamMode === "none");

  return (
    <div className="flex h-[calc(100dvh-6.5rem)] min-h-0 w-full -mx-4 -mb-4 max-md:h-[calc(100dvh-7.5rem)] max-md:min-h-[calc(100dvh-7.5rem)] max-md:mx-0 max-md:mb-0 max-md:shadow-none flex-col overflow-hidden rounded-none border border-[var(--border)] bg-[var(--bg-primary)] shadow-[0_4px_32px_rgba(0,0,0,0.45)] sm:-mx-6 sm:-mb-6 md:-mx-8 md:-mb-8 md:rounded-t-xl">
      {sideOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 md:hidden [background:var(--overlay-scrim)]"
          aria-label="Κλείσιμο"
          onClick={() => setSideOpen(false)}
        />
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        {/* left — 280px — κινητό: συρόμενο πάνελ */}
        <aside
          className={[
            "fixed inset-y-0 left-0 z-50 flex w-[min(100%,280px)] flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)] transition-transform duration-200 md:relative md:inset-auto md:z-0 md:w-[280px] md:translate-x-0",
            sideOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          ].join(" ")}
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent" aria-hidden />
          <div className="relative z-10 flex shrink-0 items-center justify-between p-4 pb-2 pr-2">
            <div>
              <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Αλεξάνδρα</h2>
              <p className="text-xs font-medium text-[var(--accent-gold)]">AI Γραμματέας</p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-[var(--text-secondary)] md:hidden"
              onClick={() => setSideOpen(false)}
              aria-label="Κλείσιμο"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="relative z-10 shrink-0 px-3 pb-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => void newConversation()}
              className="w-full rounded-xl border-2 border-[var(--accent-gold)] bg-transparent px-3 py-2.5 text-sm font-semibold text-[var(--accent-gold)] transition duration-200 hover:bg-[var(--accent-gold)] hover:text-[#0a0f1a] disabled:opacity-50"
            >
              + Νέα συνομιλία
            </button>
          </div>
          <div className="relative z-10 min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-4">
            {listLoading && <p className="px-2 text-xs text-[var(--text-muted)]">Φόρτωση…</p>}
            {!listLoading && conversations.length === 0 && (
              <p className="px-2 text-center text-xs text-[var(--text-secondary)]">Δεν υπάρχουν συνομιλίες ακόμα</p>
            )}
            {conversations.map((c) => {
              const active = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  className="group relative"
                  onMouseEnter={() => setHoveredId(c.id)}
                  onMouseLeave={() => setHoveredId((h) => (h === c.id ? null : h))}
                >
                  <button
                    type="button"
                    onClick={() => selectConversation(c.id)}
                    className={[
                      "w-full rounded-lg border-l-2 border-transparent px-3 py-2.5 text-left text-sm text-[var(--text-primary)] transition duration-200",
                      active
                        ? "border-[var(--accent-gold)] bg-[var(--bg-elevated)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]/80",
                    ].join(" ")}
                  >
                    <p className="line-clamp-2 font-medium">{c.title || "Νέα συνομιλία"}</p>
                    <p className="mt-0.5 text-[10px] text-[#94A3B8]">{fmtTime(c.updated_at)}</p>
                  </button>
                  {(hoveredId === c.id || active) && (
                    <button
                      type="button"
                      title="Διαγραφή"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(c);
                      }}
                      className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-[#94A3B8] hover:bg-white/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* right — πλήρες πλάτος chat σε κινητό */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg-primary)]">
          {selectedId && (
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-3 sm:px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-1.5 text-[var(--text-primary)] md:hidden"
                  onClick={() => setSideOpen(true)}
                  aria-label="Συνομιλίες"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <h3 className="min-w-0 flex-1 truncate text-base font-bold text-[var(--text-primary)]">{currentTitle || "Νέα συνομιλία"}</h3>
              </div>
              <button
                type="button"
                onClick={() => void newConversation()}
                disabled={loading}
                className="shrink-0 rounded-lg border border-[var(--accent-gold)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--accent-gold)] transition hover:bg-[var(--accent-gold)] hover:text-[#0a0f1a] disabled:opacity-50"
              >
                Νέα
              </button>
            </header>
          )}
          {!selectedId && (
            <div className="flex shrink-0 items-center border-b border-[var(--border)] px-3 py-2 md:hidden">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-primary)]"
                onClick={() => setSideOpen(true)}
                aria-label="Μενού συνομιλιών"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!selectedId && (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="hq-pulse-gold flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-3xl font-bold text-[#0a0f1a] shadow-[0_0_40px_rgba(201,168,76,0.25)]">
                  A
                </div>
                <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Γεια σου! Είμαι η Αλεξάνδρα</h2>
                <p className="max-w-md text-sm text-[var(--text-secondary)]">Η AI γραμματέας του γραφείου Καραγκούνη</p>
                <div className="mt-2 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                  {SUGGESTED.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={loading}
                      onClick={() => void startWithChip(c)}
                      className="rounded-2xl border border-[var(--accent-gold)]/50 bg-[var(--bg-elevated)] px-3 py-2.5 text-left text-xs text-[var(--accent-gold)] transition hover:border-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10 disabled:opacity-50"
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-muted)]">Ή ξεκινήστε με «+ Νέα συνομιλία» αριστερά.</p>
                <button
                  type="button"
                  onClick={() => void newConversation()}
                  disabled={loading}
                  className="mt-2 rounded-full px-6 py-2.5 text-sm font-semibold text-[#0A1628] disabled:opacity-50"
                  style={{ backgroundColor: "#C9A84C" }}
                >
                  + Νέα συνομιλία
                </button>
              </div>
            )}

            {selectedId && messagesLoading && (
              <div className="flex h-40 items-center justify-center p-6 text-sm text-[var(--text-secondary)]">Φόρτωση…</div>
            )}
            {selectedId && !messagesLoading && messages.map((m) => (
              <div key={m.id} className="px-4 py-2">
                <div className={m.role === "user" ? "flex flex-col items-end" : "flex items-start gap-2"}>
                  {m.role === "assistant" && (
                    <span
                      className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ color: "#0A1628", backgroundColor: "#C9A84C" }}
                    >
                      A
                    </span>
                  )}
                  <div
                    className={
                      m.role === "user"
                        ? "w-full min-w-0 max-w-full md:max-w-[min(100%,32rem)]"
                        : "min-w-0 w-full max-w-full flex-1 md:max-w-[min(100%,36rem)]"
                    }
                  >
                    {m.role === "assistant" && m.contextLabel && (
                      <span className="mb-0.5 block text-[9px] uppercase tracking-wide text-[var(--text-muted)]">{m.contextLabel}</span>
                    )}
                    <div
                      className={
                        m.role === "user"
                          ? "rounded-tl-[18px] rounded-tr-[18px] rounded-br-[4px] rounded-bl-[18px] bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] px-4 py-2.5 text-sm font-medium text-[#0a0f1a] shadow-sm"
                          : "rounded-tl-[18px] rounded-tr-[18px] rounded-br-[18px] rounded-bl-[4px] border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2.5 text-sm text-[var(--text-primary)] shadow-sm"
                      }
                    >
                      {m.role === "user" ? (
                        <p className="whitespace-pre-wrap text-[#0a0f1a]">{m.content}</p>
                      ) : (
                        <>
                          <div className="ai-md max-w-none text-sm">
                            {m.isStreaming && !m.content ? (
                              <span className="text-[var(--text-muted)]"> </span>
                            ) : (
                              <ReactMarkdown>{m.content || "—"}</ReactMarkdown>
                            )}
                            {m.isStreaming ? (
                              <span
                                className="ai-stream-cursor inline-block h-4 w-0.5 rounded-sm align-middle"
                                style={{ backgroundColor: "#C9A84C" }}
                                aria-hidden
                              />
                            ) : null}
                          </div>
                          {Array.from(
                            new Set(
                              [
                                ...(m.toolsExecutedFromDb ?? []),
                                ...(m.streamMeta?.executed ?? []),
                              ].filter(Boolean),
                            ),
                          ).length > 0 && (
                            <p className="mt-2 text-[10px] font-medium text-[#94A3B8]">
                              <span className="text-[var(--accent-gold)]">✓</span> Εκτελέστηκε
                              {Array.from(
                                new Set([
                                  ...(m.toolsExecutedFromDb ?? []),
                                  ...(m.streamMeta?.executed ?? []),
                                ]),
                              ).length > 0 && (
                                <span className="ml-1.5 text-[9px] font-normal text-[#94A3B8]">
                                  (
                                  {Array.from(
                                    new Set([
                                      ...(m.toolsExecutedFromDb ?? []),
                                      ...(m.streamMeta?.executed ?? []),
                                    ]),
                                  )
                                    .map((t) => greekToolLabel(t))
                                    .join(", ")}
                                  )
                                </span>
                              )}
                            </p>
                          )}
                          {m.findResults && m.findResults.length > 0 && (
                            <ul className="mt-2 space-y-1.5 border-t border-dashed border-[var(--border)] pt-2">
                              {m.findResults.map((c) => (
                                <li key={c.id}>
                                  <Link
                                    href={`/contacts/${c.id}`}
                                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-1.5 text-left hover:bg-[var(--bg-elevated)]"
                                  >
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003476] text-[10px] font-bold text-white">
                                      {initialsName(c.first_name, c.last_name)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-[var(--text-primary)]">
                                        {c.first_name} {c.last_name}
                                      </p>
                                      <p className="font-mono text-[10px] text-[var(--text-secondary)]">{c.phone || "—"}</p>
                                    </div>
                                    {c.call_status && (
                                      <span
                                        className={
                                          "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold " + (callStatusPill[c.call_status] ?? callStatusPill.Pending)
                                        }
                                      >
                                        {callStatusLabel(c.call_status ?? undefined)}
                                      </span>
                                    )}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          )}
                          {m.pendingAction && m.startCallMeta && canConfirmStartCall(role, m.pendingAction) && m.pendingAction.action === "start_call" && (
                            <div className="mt-2 space-y-2 border-t border-dashed border-[var(--border)] pt-2">
                              <p className="text-xs text-[var(--text-primary)]">
                                Να ξεκινήσω κλήση στον <strong>{m.startCallMeta.name}</strong> ({m.startCallMeta.phone});
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={loading}
                                  onClick={() => void confirmStartCall(m.id)}
                                  className="flex-1 rounded-lg bg-[#003476] py-1.5 text-xs font-semibold text-white"
                                >
                                  Ναι
                                </button>
                                <button type="button" onClick={() => rejectStartCall(m.id)} className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs font-medium text-[var(--text-secondary)]">
                                  Όχι
                                </button>
                              </div>
                            </div>
                          )}
                          {m.pendingAction && canConfirmCreate(role, m.pendingAction) && m.pendingAction.action === "create_contact" && (
                            <div className="mt-2 space-y-2 border-t border-dashed border-[var(--border)] pt-2">
                              <p className="text-[10px] uppercase text-[var(--text-muted)]">Νέα επαφή — σύνοψη</p>
                              <pre className="mb-1 max-h-20 overflow-auto rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-secondary)]">{JSON.stringify(m.pendingAction.data, null, 2)}</pre>
                              <div className="flex gap-2">
                                <button type="button" disabled={loading} onClick={() => void execute(m.id)} className="flex-1 rounded-lg py-1.5 text-xs font-semibold text-[#0A1628] disabled:opacity-50" style={{ backgroundColor: "#C9A84C" }}>
                                  Εκτέλεση
                                </button>
                                <button type="button" onClick={() => rejectCreate(m.id)} className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs text-[var(--text-secondary)]">
                                  Ακύρωση
                                </button>
                              </div>
                            </div>
                          )}
                          {m.pendingAction && !m.executed && canExecuteAction(role, m.pendingAction) && m.pendingAction.action === "update_status" && (
                            <div className="mt-2 border-t border-dashed border-[var(--border)] pt-2">
                              <pre className="mb-1 max-h-20 overflow-auto rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-secondary)]">{JSON.stringify(m.pendingAction, null, 0)}</pre>
                              <button type="button" disabled={loading} onClick={() => void execute(m.id)} className="w-full rounded-lg py-1.5 text-xs font-semibold text-[#0A1628] disabled:opacity-50" style={{ backgroundColor: "#C9A84C" }}>
                                Εκτέλεση
                              </button>
                            </div>
                          )}
                          {m.pendingAction &&
                            !m.executed &&
                            m.pendingAction.action !== "update_status" &&
                            m.pendingAction.action !== "start_call" &&
                            m.pendingAction.action !== "create_contact" &&
                            canExecuteAction(role, m.pendingAction) && (
                              <div className="mt-2 border-t border-dashed border-[var(--border)] pt-2">
                                <p className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Προτεινόμενη ενέργεια</p>
                                <pre className="mb-2 max-h-24 overflow-auto rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-secondary)]">{JSON.stringify(m.pendingAction, null, 0)}</pre>
                                <button type="button" disabled={loading} onClick={() => void execute(m.id)} className="w-full rounded-lg py-1.5 text-xs font-semibold text-[#0A1628] disabled:opacity-50" style={{ backgroundColor: "#C9A84C" }}>
                                  Εκτέλεση
                                </button>
                              </div>
                            )}
                          {m.pendingAction && !m.executed && !canExecuteAction(role, m.pendingAction) && m.pendingAction.action !== "start_call" && m.pendingAction.action !== "create_contact" && (
                            <p className="mt-2 text-xs text-amber-200/95">Δεν έχετε δικαίωμα· ρωτήστε υπεύθυνο.</p>
                          )}
                        </>
                      )}
                    </div>
                    <p
                      className={
                        m.role === "user" ? "mt-1 text-right text-[10px] text-[#94A3B8]" : "mt-1 text-[10px] text-[#94A3B8]"
                      }
                    >
                      {m._createdAt ? fmtTime(m._createdAt) : ""}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {selectedId && streamMode === "typing" && (
              <div className="flex justify-start gap-2 px-4 py-2">
                <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ color: "#0A1628", backgroundColor: "#C9A84C" }}>A</span>
                <div className="flex items-center gap-0.5 self-center rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2.5">
                  <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:0ms]" />
                  <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:150ms]" />
                  <span className="ai-typing h-1.5 w-1.5 rounded-full bg-[var(--text-muted)] [animation-delay:300ms]" />
                </div>
              </div>
            )}
            {error && <p className="px-4 text-center text-xs text-red-600">{error}</p>}
            <div ref={bottomRef} />
          </div>

          {selectedId && (
            <div
              className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-card)] p-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              {showChips && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {SUGGESTED.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => void send(c)}
                      className="rounded-full border border-[var(--accent-gold)]/40 bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] text-[var(--accent-gold)] transition hover:bg-[var(--accent-gold)]/15"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="flex gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/50 p-2 pl-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
              >
                <textarea
                  className="min-h-[48px] min-w-0 flex-1 resize-y rounded-2xl border-0 bg-transparent px-1 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-0"
                  placeholder="Γράψτε εδώ…"
                  rows={2}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!loading && streamMode === "none" && input.trim()) void send(input);
                    }
                  }}
                  disabled={loading || streamMode !== "none"}
                />
                <button
                  type="submit"
                  disabled={loading || streamMode !== "none" || !input.trim()}
                  className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-2xl bg-gradient-to-br from-[var(--accent-gold)] to-[#8b6914] text-[#0a0f1a] shadow-md transition hover:shadow-[0_0_20px_rgba(201,168,76,0.35)] disabled:opacity-40"
                  aria-label="Αποστολή"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {toDelete && (
        <CenteredModal
          open={!!toDelete}
          onClose={() => setToDelete(null)}
          title="Διαγραφή συνομιλίας"
          ariaLabel="Επιβεβαίωση διαγραφής συνομιλίας"
          className="!max-w-sm"
          footer={
            <>
              <button type="button" onClick={() => setToDelete(null)} className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Άκυρο
              </button>
              <button type="button" disabled={loading} onClick={() => void deleteConv(toDelete)} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Διαγραφή
              </button>
            </>
          }
        >
          <p className="text-sm font-medium text-[var(--text-primary)]">Διαγραφή αυτής της συνομιλίας;</p>
        </CenteredModal>
      )}
    </div>
  );
}
