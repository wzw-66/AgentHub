"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import RightPanel from "@/components/RightPanel";
import { useChat } from "@/lib/chat-context";
import { useSSEStream } from "@/hooks/useSSEStream";

export default function ChatPage() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [rightPanelContent, setRightPanelContent] = useState<{
    type: "artifact" | "agent" | "preview";
    id: string;
    content?: string;
    title?: string;
  } | null>(null);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(290);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      const newWidth = startWidth - delta;
      setRightPanelWidth(Math.max(180, Math.min(600, newWidth)));
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [rightPanelWidth]);

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
            onToggleRightPanel={() => setRightPanelVisible((v) => !v)}
            onShowPreview={(content, title) => setRightPanelContent({ type: "preview", id: "preview", content, title })}
          />
        </div>

        {/* Drag Handle */}
        {rightPanelVisible && (rightPanelContent || activeConversationId) && (
          <div
            className="flex-shrink-0 relative cursor-col-resize group"
            style={{ width: "6px" }}
            onMouseDown={handleResizeStart}
          >
            <div
              className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] transition-colors group-hover:bg-border"
              style={{ background: "var(--border-light)" }}
            />
          </div>
        )}

        {/* Right Panel */}
        {rightPanelVisible && (rightPanelContent || activeConversationId) && (
          <div
            className="flex-shrink-0 animate-fade-in-up overflow-hidden"
            style={{ width: rightPanelWidth }}
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
