"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/lib/chat-context";
import { api } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import CreateAgentModal from "./CreateAgentModal";
import { ThemeSwitcher } from "./ThemeSwitcher";
import ChatListView from "./ChatListView";
import AddAgentView from "./AddAgentView";
import AgentManageView from "./AgentManageView";

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

type SidebarView = "chats" | "add-agent" | "agents";

export default function Sidebar({ activeConversationId, onSelectConversation }: SidebarProps) {
  const { user, logout } = useAuth();
  const {
    conversations, isLoadingConversations, createConversation, contacts,
    fetchContacts, fetchConversations, togglePinConversation, toggleArchiveConversation,
  } = useChat();
  const { t } = useI18n();

  const [sidebarView, setSidebarView] = useState<SidebarView>("chats");
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);

  // ─── Handlers ──────────────────────────────────────────────────────────

  function handleNewChat() {
    setSidebarView("add-agent");
  }

  async function handlePillClick(agentId: string) {
    try {
      const existing = await api.get<{ conversation: { id: string } | null }>(
        `/api/conversations/find-by-agent/${agentId}`,
      );
      if (existing.conversation?.id) {
        onSelectConversation(existing.conversation.id);
        return;
      }
    } catch {
      // fall through to create
    }
    const agent = contacts?.find((a) => a.id === agentId);
    const title = agent ? `${agent.name}` : "新对话";
    const conv = await createConversation(title, "single", [agentId]);
    if (conv?.id) onSelectConversation(conv.id);
  }

  async function handleDeleteConversation(convId: string) {
    try {
      await api.delete(`/api/conversations/${convId}/delete`);
      if (activeConversationId === convId) onSelectConversation("");
      fetchConversations();
    } catch {
      // silent
    }
  }

  // ─── View title ────────────────────────────────────────────────────────

  const viewTitle = sidebarView === "add-agent" ? "添加 Agent" : "我的 Agent";

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-sidebar)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: "22px 18px 14px" }}
      >
        {sidebarView === "chats" ? (
          <>
            <h2
              className="font-semibold"
              style={{
                fontSize: "16px",
                fontWeight: 600,
                letterSpacing: "-0.3px",
                color: "var(--text-primary)",
              }}
            >
              Agent<span style={{ color: "var(--text-tertiary)", fontWeight: 300 }}>Hub</span>
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleNewChat}
                className="flex items-center justify-center text-sm transition-all cursor-pointer"
                style={{
                  width: "30px",
                  height: "30px",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--bg-app)",
                  color: "var(--text-secondary)",
                  fontSize: "15px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.transform = "scale(1.05)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-app)";
                  e.currentTarget.style.transform = "scale(1)";
                }}
                title="新建会话"
              >
                +
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarView("chats")}
                className="flex items-center justify-center transition-colors cursor-pointer"
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                  fontSize: "14px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                title="返回"
              >
                ←
              </button>
              <h2
                className="font-semibold"
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                {viewTitle}
              </h2>
            </div>
          </>
        )}
      </div>

      {/* Contact Strip — visible in all views */}
      <div
        className="flex gap-1.5 overflow-x-auto flex-shrink-0 items-center"
        style={{ padding: "2px 14px 10px" }}
      >
        {contacts && contacts.length > 0 && (
          <>
            {contacts.slice(0, 4).map((agent) => {
            const agentPalette = [
              "#1a1a2e", "#b8860b", "#2b8a6b", "#7c3aed", "#c93a3a",
              "#2563eb", "#c2410c", "#059669", "#6d28d9", "#be185d",
            ];
            let hash = 0;
            for (let i = 0; i < (agent.name ?? "").length; i++) {
              hash = ((hash << 5) - hash + agent.name.charCodeAt(i)) | 0;
            }
            const color = agentPalette[Math.abs(hash) % agentPalette.length]!;

            return (
              <div
                key={agent.id}
                className="contact-pill"
                onClick={() => handlePillClick(agent.id)}
                title={agent.name}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center text-white font-medium"
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: color,
                    fontSize: "8px",
                  }}
                >
                  {(agent.name ?? "?")[0]?.toUpperCase()}
                </span>
                {agent.name}
              </div>
            );
          })}
          </>
        )}
        {/* Agent management button */}
        <button
          onClick={() => setSidebarView("agents")}
          className="flex items-center justify-center flex-shrink-0 ml-auto transition-all cursor-pointer"
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-app)",
            border: "1px solid var(--border-light)",
            color: "var(--text-secondary)",
            fontSize: "12px",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "var(--bg-app)";
            e.currentTarget.style.transform = "scale(1)";
          }}
          title="Agent 管理"
        >
          ☰
        </button>
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden" style={{ position: "relative" }}>
        <div
          style={{
            opacity: sidebarView === "chats" ? 1 : 0,
            transform: sidebarView === "chats" ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
            height: "100%",
            overflow: "hidden",
            pointerEvents: sidebarView === "chats" ? "auto" : "none",
            position: "absolute",
            inset: 0,
          }}
        >
          <ChatListView
            conversations={conversations}
            contacts={contacts}
            isLoadingConversations={isLoadingConversations}
            activeConversationId={activeConversationId}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            togglePinConversation={togglePinConversation}
            toggleArchiveConversation={toggleArchiveConversation}
          />
        </div>
        <div
          style={{
            opacity: sidebarView === "add-agent" ? 1 : 0,
            transform: sidebarView === "add-agent" ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
            height: "100%",
            overflow: "hidden",
            pointerEvents: sidebarView === "add-agent" ? "auto" : "none",
            position: "absolute",
            inset: 0,
          }}
        >
          <AddAgentView
            contacts={contacts}
            createConversation={createConversation}
            onSelectConversation={onSelectConversation}
            onBack={() => setSidebarView("chats")}
          />
        </div>
        <div
          style={{
            opacity: sidebarView === "agents" ? 1 : 0,
            transform: sidebarView === "agents" ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.2s ease, transform 0.2s ease",
            height: "100%",
            overflow: "hidden",
            pointerEvents: sidebarView === "agents" ? "auto" : "none",
            position: "absolute",
            inset: 0,
          }}
        >
          <AgentManageView
            contacts={contacts}
            createConversation={createConversation}
            onSelectConversation={onSelectConversation}
            onRefresh={fetchContacts}
            onBack={() => setSidebarView("chats")}
          />
        </div>
      </div>

      {/* Bottom section */}
      <div
        className="flex-shrink-0"
        style={{ padding: "6px 14px 14px" }}
      >
        <button
          onClick={() => setShowCreateAgentModal(true)}
          className="flex items-center justify-center gap-1 w-full transition-all cursor-pointer"
          style={{
            padding: "9px",
            border: "1.5px dashed var(--border)",
            borderRadius: "var(--radius-md)",
            background: "none",
            color: "var(--text-tertiary)",
            fontSize: "11px",
            fontFamily: "var(--font-sans)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--text-secondary)";
            e.currentTarget.style.color = "var(--text-secondary)";
            e.currentTarget.style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-tertiary)";
            e.currentTarget.style.background = "none";
          }}
        >
          + 创建新 Agent
        </button>

        {/* User info */}
        <div className="flex items-center gap-2" style={{ marginTop: "10px" }}>
          <div
            className="flex items-center justify-center text-white font-medium rounded-full flex-shrink-0"
            style={{
              width: "28px",
              height: "28px",
              background: "var(--text-tertiary)",
              fontSize: "10px",
            }}
          >
            {user?.username?.charAt(0)?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="truncate font-medium"
              style={{ color: "var(--text-primary)", fontSize: "12px" }}
            >
              {user?.username || "User"}
            </div>
          </div>
          <ThemeSwitcher />
          <button
            onClick={() => { logout(); window.location.href = "/login"; }}
            className="rounded transition-colors flex-shrink-0"
            style={{
              padding: "2px 8px",
              color: "var(--text-tertiary)",
              fontSize: "10px",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
          >
            {t("chat").logout}
          </button>
        </div>
      </div>

      {/* Create Agent Modal */}
      {showCreateAgentModal && (
        <CreateAgentModal
          onClose={() => setShowCreateAgentModal(false)}
          onCreated={() => {
            setShowCreateAgentModal(false);
            fetchContacts();
          }}
        />
      )}
    </div>
  );
}
