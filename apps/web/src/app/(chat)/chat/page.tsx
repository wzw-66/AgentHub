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
    <div
      className="flex items-center justify-center"
      style={{
        height: "100vh",
        padding: "24px",
      }}
    >
      {/* Fixed container: 1140x740, centered */}
      <div
        className="relative z-10 flex overflow-hidden"
        style={{
          width: "1140px",
          height: "740px",
          background: "var(--bg-app)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "0 2px 24px rgba(0,0,0,0.04), 0 0 0 1px var(--border)",
        }}
      >
        {/* Sidebar */}
        <div
          className="flex-shrink-0"
          style={{
            width: "var(--sidebar-width)",
            borderRight: "1px solid var(--border)",
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
        {(rightPanelContent || activeConversationId) && (
          <div
            className="flex-shrink-0 animate-fade-in-up"
            style={{
              width: "var(--right-panel-width)",
              borderLeft: "1px solid var(--border-light)",
            }}
          >
            <RightPanel
              content={rightPanelContent}
              onClose={() => setRightPanelContent(null)}
              conversationId={activeConversationId}
            />
          </div>
        )}
      </div>
    </div>
  );
}
