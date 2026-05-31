"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import RightPanel from "@/components/RightPanel";
import { useChat } from "@/lib/chat-context";
import { useSSEStream } from "@/hooks/useSSEStream";

export default function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [rightPanelContent, setRightPanelContent] = useState<{
    type: "artifact" | "agent";
    id: string;
  } | null>(null);

  const { setActiveConversation } = useChat();

  useEffect(() => {
    setActiveConversation(activeConversationId);
  }, [activeConversationId, setActiveConversation]);

  useSSEStream(activeConversationId);

  return (
    <div className="relative z-10 flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div
        className="flex-shrink-0"
        style={{
          width: "var(--sidebar-width)",
          borderRight: "1px solid var(--theme-border)",
        }}
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
          onShowArtifact={(id) => setRightPanelContent({ type: "artifact", id })}
          onShowAgent={(id) => setRightPanelContent({ type: "agent", id })}
        />
      </div>

      {/* Right Panel */}
      {rightPanelContent && (
        <div
          className="flex-shrink-0 animate-fade-in-up"
          style={{
            width: "var(--right-panel-width)",
            borderLeft: "1px solid var(--theme-border)",
          }}
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
