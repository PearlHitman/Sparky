"use client";

import { useState } from "react";

import InboxList from "@/components/InboxList";
import ThreadView from "@/components/ThreadView";

export default function Home() {
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);

  const currentUsername = process.env.NEXT_PUBLIC_INSTAGRAM_USERNAME ?? null;

  return (
    <div className="flex flex-row h-screen overflow-hidden">
      <aside className="w-80 flex-col border-r border-border bg-bg flex shrink-0">
        <div className="h-14 px-4 flex items-center border-b border-border shrink-0">
          <span
            className="text-accent text-2xl"
            style={{ fontFamily: 'Caveat, "Brush Script MT", cursive' }}
          >
            Spark
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <InboxList
            selectedId={selectedConversationId}
            onSelect={setSelectedConversationId}
          />
        </div>
      </aside>
      {selectedConversationId === null ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Select a conversation</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <ThreadView
            conversationId={selectedConversationId}
            currentUsername={currentUsername}
          />
        </div>
      )}
    </div>
  );
}
