"use client";

import { useEffect, useRef, useState } from "react";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/time";
import type { Message } from "@/lib/types";

interface ThreadViewProps {
  conversationId: string;
  currentUsername: string | null;
}

export default function ThreadView({
  conversationId,
  currentUsername,
}: ThreadViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    setLoading(true);
    setError(null);
    setDraft("");
    setSendError(null);

    (async () => {
      const { data, error: queryError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: true, nullsFirst: false })
        .limit(200);

      if (cancelled) return;

      if (queryError) {
        setError(new Error(queryError.message));
        setMessages([]);
      } else {
        setMessages((data ?? []) as Message[]);
      }
      setLoading(false);

      if (cancelled) return;

      channel = supabase
        .channel(`messages:${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const incoming = payload.new as Message;
            setMessages((prev) => {
              const optimisticIndex = prev.findIndex(
                (m) =>
                  m.id.startsWith("optimistic-") &&
                  m.message_text === incoming.message_text &&
                  m.sender_username === incoming.sender_username
              );
              if (optimisticIndex !== -1) {
                const next = [...prev];
                next[optimisticIndex] = incoming;
                return next;
              }
              return [...prev, incoming];
            });
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setSendError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_SPARK_API_URL ?? "";
      const res = await fetch(apiUrl + "/api/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, text }),
      });

      if (!res.ok) {
        let errorMsg = res.statusText || `Request failed (${res.status})`;
        try {
          const body = await res.json();
          if (body && typeof body.error === "string") {
            errorMsg = body.error;
          } else if (body && typeof body.message === "string") {
            errorMsg = body.message;
          }
        } catch {
          // ignore JSON parse errors
        }
        setSendError(errorMsg);
        setSending(false);
        return;
      }

      const now = Date.now();
      const optimistic: Message = {
        id: "optimistic-" + now,
        conversation_id: conversationId,
        instagram_message_id: "optimistic-" + now,
        sender_username: currentUsername,
        message_text: text,
        sent_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);
      setDraft("");
      setSending(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
      setSending(false);
    }
  };

  let topSection: React.ReactNode;
  if (loading) {
    topSection = (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted text-sm">Loading messages...</p>
      </div>
    );
  } else if (error) {
    topSection = (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400 text-sm">{error.message}</p>
      </div>
    );
  } else if (messages.length === 0) {
    topSection = (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted text-sm">No messages in this thread yet.</p>
      </div>
    );
  } else {
    topSection = (
      <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-3">
        {messages.map((msg) => {
          const isMine =
            currentUsername !== null && msg.sender_username === currentUsername;

          const bubbleClass =
            "max-w-[70%] px-4 py-2 rounded-2xl text-sm leading-relaxed " +
            (isMine
              ? "bg-accent text-[#14120e] rounded-br-sm"
              : "bg-[#1c1a15] text-fg rounded-bl-sm border border-border");

          const metaClass =
            "text-[10px] text-muted mt-1" +
            (isMine ? " text-right" : " text-left");

          return (
            <div
              key={msg.id}
              className={"flex" + (isMine ? " justify-end" : " justify-start")}
            >
              <div className="flex flex-col max-w-[70%]">
                <div className={bubbleClass}>{msg.message_text ?? ""}</div>
                <div className={metaClass}>
                  {isMine ? "You" : msg.sender_username ?? "them"} ·{" "}
                  {formatRelativeTime(msg.sent_at)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    );
  }

  const sendEnabled = draft.trim().length > 0 && !sending;
  const buttonClass =
    "shrink-0 h-10 w-10 rounded-full flex items-center justify-center transition-colors " +
    (sendEnabled
      ? "bg-accent text-[#14120e] hover:bg-orange-400"
      : "bg-[#1c1a15] text-muted cursor-not-allowed");

  return (
    <div className="flex flex-col h-full">
      {topSection}
      {sendError && (
        <p className="px-4 pb-1 text-xs text-red-400">{sendError}</p>
      )}
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-end gap-3">
        <textarea
          className="flex-1 bg-[#1c1a15] text-fg text-sm rounded-xl px-4 py-2.5 border border-border resize-none outline-none focus:border-accent placeholder:text-muted min-h-[44px] max-h-[120px]"
          placeholder="Message..."
          rows={1}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (sendError) setSendError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          type="button"
          className={buttonClass}
          disabled={!draft.trim() || sending}
          onClick={handleSend}
          aria-label="Send message"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
