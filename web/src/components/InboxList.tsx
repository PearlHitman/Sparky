"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { formatRelativeTime } from "@/lib/time";
import type { Conversation } from "@/lib/types";

interface InboxListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function InboxList({ selectedId, onSelect }: InboxListProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("conversations")
        .select("*")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(50);

      if (cancelled) return;

      if (queryError) {
        setError(new Error(queryError.message));
        setConversations([]);
      } else {
        setError(null);
        setConversations((data ?? []) as Conversation[]);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="text-muted px-4 py-3 text-sm">Loading...</p>;
  }

  if (error) {
    return <p className="text-red-400 px-4 py-3 text-sm">{error.message}</p>;
  }

  if (conversations.length === 0) {
    return (
      <p className="text-muted px-4 py-3 text-sm">
        No conversations yet. Run the scraper.
      </p>
    );
  }

  return (
    <ul>
      {conversations.map((conv) => {
        const selected = selectedId === conv.id;
        return (
          <li key={conv.id}>
            <div
              role="button"
              onClick={() => onSelect(conv.id)}
              className={
                "flex items-start gap-3 px-4 py-3 border-b border-border cursor-pointer " +
                (selected
                  ? "bg-[#1c1a15] border-l-2 border-l-accent"
                  : "hover:bg-[#1c1a15]")
              }
            >
              <div className="flex-1 min-w-0">
                <div className="text-fg font-medium text-sm truncate">
                  {conv.participant_usernames ?? "Unknown"}
                </div>
                <div className="text-muted text-xs truncate mt-0.5">
                  {conv.last_message_preview ?? "No messages"}
                </div>
              </div>
              <div className="shrink-0">
                <div className="text-muted text-xs mt-0.5">
                  {formatRelativeTime(conv.last_message_at)}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
