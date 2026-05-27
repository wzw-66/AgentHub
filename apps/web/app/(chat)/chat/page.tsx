"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import RightPanel from "@/components/RightPanel";
import { useChat } from "@/lib/chat-context";
import { useSSEStream } from "@/hooks/useSSEStream";

export default function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [rightPanelContent, setRightPanelContent] = useState<{
    type: "artifact" | "agent";
    id: string;
  } | null>(null);

  const { setActiveConversation } = useChat();

  // ─── Sync active conversation to ChatContext ────────────────────
  useEffect(() => {
    setActiveConversation(activeConversationId);
  }, [activeConversationId, setActiveConversation]);

  // ─── SSE stream for active conversation ─────────────────────────
  useSSEStream(activeConversationId);

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <div
        className="w-72 flex-shrink-0 border-r border-gray-200"
        style={{ width: "var(--sidebar-width)" }}
      >
        <Sidebar
          activeConversationId={activeConversationId}
          onSelectConversation={setActiveConversationId}
        />
      </div>

      {/* Chat Panel */}
      <div className="flex flex-1 flex-col min-w-0">
        <ChatPanel
          conversationId={activeConversationId}
          onShowArtifact={(id) =>
            setRightPanelContent({ type: "artifact", id })
          }
          onShowAgent={(id) => setRightPanelContent({ type: "agent", id })}
        />
      </div>

      {/* Right Panel */}
      {rightPanelContent && (
        <div
          className="w-96 flex-shrink-0 border-l border-gray-200"
          style={{ width: "var(--right-panel-width)" }}
        >
          <RightPanel
            content={rightPanelContent}
            onClose={() => setRightPanelContent(null)}
          />
        </div>
      )}
    </div>
  );
}
