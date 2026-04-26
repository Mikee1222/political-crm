"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fetchWithTimeout, CLIENT_FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { useProfile } from "@/contexts/profile-context";
import { mapDbToMsg, type Msg, type MsgWithT, type RowConv, type StreamMeta } from "./alexandra-chat-helpers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AlexandraChatContext = createContext<any>(null);

export function useAlexandraChat() {
  const v = useContext(AlexandraChatContext);
  if (v == null) throw new Error("useAlexandraChat requires AlexandraChatProvider");
  return v;
}

export function AlexandraChatProvider({ children }: { children: ReactNode }) {
  const { profile } = useProfile();
  const [conversations, setConversations] = useState<RowConv[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MsgWithT[]>([]);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
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
  /** Client-side: full spreadsheet rows to attach to requests until import completes */
  const importStashRef = useRef<{
    conversationId: string;
    rows: Array<Record<string, unknown>>;
    fileName?: string;
    sheetName?: string;
  } | null>(null);
  const role = profile?.role;
  const router = useRouter();
  const pathname = usePathname();
  const isAlexandraPage = Boolean(pathname?.startsWith("/alexandra"));
  const [miniWindowOpen, setMiniWindowOpen] = useState(false);
  const [miniWindowMinimized, setMiniWindowMinimized] = useState(false);

  const enterMiniFromPage = useCallback(() => {
    setMiniWindowOpen(true);
    setMiniWindowMinimized(false);
    router.push("/dashboard");
  }, [router]);
  const openMiniFromBubble = useCallback(() => {
    setMiniWindowOpen(true);
    setMiniWindowMinimized(false);
  }, []);
  const goToFullAlexandra = useCallback(() => {
    setMiniWindowOpen(false);
    setMiniWindowMinimized(false);
    router.push("/alexandra");
  }, [router]);
  const closeMiniWindow = useCallback(() => {
    setMiniWindowOpen(false);
    setMiniWindowMinimized(false);
  }, []);

  const messagesRef = useRef<Msg[]>([]);
  messagesRef.current = messages;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/ai-conversations", { timeoutMs: CLIENT_FETCH_TIMEOUT_MS });
      const data = (await res.json()) as { conversations?: RowConv[]; error?: string };
      if (!res.ok) {
        if (res.status === 401) {
          setError(data.error || "Μη εξουσιοδότηση");
        } else {
          setError(data.error || "Σφάλμα");
        }
        setConversations([]);
        return;
      }
      setConversations(data.conversations ?? []);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        setConversations([]);
      } else {
        setError("Σφάλμα δικτύου");
        setConversations([]);
      }
    } finally {
      setListLoading(false);
    }
  }, []);

  /** Do not block dashboard/login: only load conversation list on /alexandra. */
  useEffect(() => {
    if (!isAlexandraPage) {
      setListLoading(false);
      return;
    }
    void loadList();
  }, [isAlexandraPage, loadList]);

  const loadMessages = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setMessagesLoading(true);
      setError(null);
      try {
        const res = await fetchWithTimeout(`/api/ai-conversations/${id}/messages`, { timeoutMs: CLIENT_FETCH_TIMEOUT_MS });
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

  const setSpreadsheetImport = useCallback(
    (p: { conversationId: string; rows: Array<Record<string, unknown>>; fileName?: string; sheetName?: string } | null) => {
      importStashRef.current = p;
    },
    [],
  );

  const newConversation = useCallback(async (): Promise<string | null> => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/ai-conversations", { method: "POST", timeoutMs: CLIENT_FETCH_TIMEOUT_MS });
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
      importStashRef.current = null;
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
        const res = await fetchWithTimeout(`/api/ai-conversations/${c.id}`, { method: "DELETE", timeoutMs: CLIENT_FETCH_TIMEOUT_MS });
        const _data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(_data.error || "Σφάλμα");
          return;
        }
        setConversations((list) => list.filter((x) => x.id !== c.id));
        if (selectedId === c.id) {
          setSelectedId(null);
          setMessages([]);
          importStashRef.current = null;
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
        timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
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
          current?: number;
          total?: number;
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
              if (j.tool === "bulk_create_contacts") {
                importStashRef.current = null;
              }
              setMessages((m) =>
                m.map((row) => {
                  if (row.id !== streamAssistId) return row;
                  const prev = row.streamMeta?.executed ?? [];
                  if (prev.includes(String(j.tool))) return row;
                  return {
                    ...row,
                    streamMeta: {
                      ...row.streamMeta,
                      executed: [...prev, String(j.tool)],
                      bulkProgress: j.tool === "bulk_create_contacts" ? undefined : row.streamMeta?.bulkProgress,
                    } as StreamMeta,
                  };
                }),
              );
            } else if (j.event === "bulk_progress" && j.current != null && j.total != null) {
              ensureAssistant();
              setMessages((m) =>
                m.map((row) =>
                  row.id === streamAssistId
                    ? {
                        ...row,
                        streamMeta: {
                          ...row.streamMeta,
                          executed: row.streamMeta?.executed ?? [],
                          bulkProgress: { current: j.current!, total: j.total! },
                        } as StreamMeta,
                      }
                    : row,
                ),
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
        const stash = importStashRef.current;
        const payload: {
          message: string;
          conversationId: string;
          attachment?: {
            type: "spreadsheet_import";
            rows: Array<Record<string, unknown>>;
            fileName?: string;
            sheetName?: string;
          };
        } = { message: text, conversationId: convId };
        if (stash && stash.conversationId === convId) {
          payload.attachment = {
            type: "spreadsheet_import",
            rows: stash.rows,
            fileName: stash.fileName,
            sheetName: stash.sheetName,
          };
        }
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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
        timeoutMs: CLIENT_FETCH_TIMEOUT_MS,
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


  const value = {
    profile, role, conversations, selectedId, setSelectedId, messages, setMessages, loading, setLoading,
    listLoading, setListLoading, messagesLoading, setMessagesLoading, input, setInput, error, setError, toDelete, setToDelete,
    hoveredId, setHoveredId, sideOpen, setSideOpen, streamMode, setStreamMode, bottomRef, loadList, loadMessages, newConversation,
    deleteConv, execute, send, startWithChip, confirmStartCall, rejectStartCall, rejectCreate, selectConversation, currentTitle, isEmpty, showChips, scrollToBottom, setSpreadsheetImport,
    miniWindowOpen, setMiniWindowOpen, miniWindowMinimized, setMiniWindowMinimized, enterMiniFromPage, openMiniFromBubble, goToFullAlexandra, closeMiniWindow,
  };
  return <AlexandraChatContext.Provider value={value}>{children}</AlexandraChatContext.Provider>;
}
