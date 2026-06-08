"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/lib/chat-context";
import { useI18n } from "@/lib/i18n";
import CreateAgentModal from "./CreateAgentModal";
import { ThemeSwitcher } from "./ThemeSwitcher";

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

// ─── Agent contact colors ─────────────────────────────────────────────

/** Palette of warm, distinguishable agent avatar colors. */
const AGENT_PALETTE = [
  "#1a1a2e", "#b8860b", "#2b8a6b", "#7c3aed", "#c93a3a",
  "#2563eb", "#c2410c", "#059669", "#6d28d9", "#be185d",
];

/** Generate a consistent color for an agent based on its name/ID hash. */
function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length]!;
}

export default function Sidebar({ activeConversationId, onSelectConversation }: SidebarProps) {
  const { user, logout } = useAuth();
  const { conversations, isLoadingConversations, createConversation, contacts } = useChat();
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);

  const filteredConversations = useMemo(
    () => conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())),
    [conversations, searchQuery],
  );

  // Agents to show in contact strip (top 4-5 frequent agents)
  const topAgents = (contacts ?? []).slice(0, 4);

  async function handleNewChat() { setShowNewChatDialog(true); }

  async function handleSelectAgent(agentId: string) {
    const agent = contacts?.find((a: { id: string; name: string }) => a.id === agentId);
    const title = agent ? `${agent.name}` : "新对话";
    const conv = await createConversation(title, "single", [agentId]);
    if (conv?.id) onSelectConversation(conv.id);
    setShowNewChatDialog(false);
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg-sidebar)" }}>
      {/* Header — Design Doc Section 3.1 */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: "22px 18px 14px" }}
      >
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
        >
          +
        </button>
      </div>

      {/* Search — Design Doc Section 3.2 */}
      <div
        className="flex items-center gap-1.5 text-xs transition-colors flex-shrink-0"
        style={{
          margin: "0 14px 12px",
          padding: "7px 12px",
          background: "var(--bg-app)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-tertiary)",
        }}
      >
        <span style={{ fontSize: "11px" }}>&#128269;</span>
        <input
          placeholder={t("chat").searchPlaceholder}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: "var(--text-primary)", fontSize: "12px" }}
        />
        <kbd
          className="rounded border px-1"
          style={{
            borderColor: "var(--border-light)",
            color: "var(--text-tertiary)",
            fontSize: "9px",
            fontFamily: "var(--font-mono)",
          }}
        >
          ⌘K
        </kbd>
      </div>

      {/* Contact Strip — Design Doc Section 3.3 */}
      {topAgents.length > 0 && (
        <div
          className="flex gap-1.5 overflow-x-auto flex-shrink-0"
          style={{ padding: "2px 14px 10px" }}
        >
          {topAgents.map((agent) => {
            return (
              <div
                key={agent.id}
                className="contact-pill"
                onClick={() => onSelectConversation(agent.id)}
                title={agent.name}
              >
                <span
                  className="flex-shrink-0 flex items-center justify-center text-white font-medium"
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    background: getAgentColor(agent.name ?? ""),
                    fontSize: "8px",
                  }}
                >
                  {(agent.name ?? "?")[0]?.toUpperCase()}
                </span>
                {agent.name}
              </div>
            );
          })}
        </div>
      )}

      {/* Conversation List — Design Doc Section 3.4 */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "0 8px" }}>
        {isLoadingConversations ? (
          <div className="flex flex-col gap-1.5 px-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: "48px", marginBottom: "2px" }} />
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 text-center"
            style={{ color: "var(--text-tertiary)", fontSize: "11px" }}
          >
            <p>{t("chat").emptyConversations}</p>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className="w-full text-left transition-all"
                style={{
                  padding: "11px 12px",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  marginBottom: "2px",
                  position: "relative",
                  background: isActive ? "var(--bg-active)" : "transparent",
                  transition: "all 0.18s ease",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = "transparent";
                }}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div
                    style={{
                      position: "absolute",
                      left: "-6px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      width: "3px",
                      height: "24px",
                      background: "var(--text-primary)",
                      borderRadius: "0 3px 3px 0",
                    }}
                  />
                )}
                <div className="flex justify-between items-center">
                  <span
                    className="truncate"
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--text-primary)",
                    }}
                  >
                    {conv.title}
                  </span>
                  <span
                    className="flex-shrink-0"
                    style={{
                      color: "var(--text-tertiary)",
                      fontSize: "10px",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {conv.lastMessageAt
                      ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </span>
                </div>
                <div
                  className="truncate"
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: "11px",
                    marginTop: "3px",
                  }}
                >
                  {conv.lastMessageAt
                    ? new Date(conv.lastMessageAt).toLocaleDateString()
                    : ""}
                </div>
                {/* Mini agent avatars */}
                <div className="flex gap-0.5" style={{ marginTop: "5px" }}>
                  {(conv.contactIds ?? []).slice(0, 3).map((contactId, i) => {
                    const contact = contacts?.find((c) => c.id === contactId);
                    return (
                      <span
                        key={contactId ?? i}
                        className="flex items-center justify-center text-white"
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          fontSize: "7px",
                          background: getAgentColor(contact?.name ?? ""),
                          border: "1.5px solid var(--bg-sidebar)",
                        }}
                      >
                        {(contact?.name ?? "?")[0]?.toUpperCase()}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Bottom section — Design Doc Section 3.5 */}
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
            // Refresh contacts list after creation
            window.location.reload();
          }}
        />
      )}

      {/* New Chat Dialog */}
      {showNewChatDialog && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowNewChatDialog(false)} />
          <div
            className="absolute bottom-20 left-3 right-3 z-50 rounded-lg border p-3 shadow-lg"
            style={{
              background: "var(--bg-app)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-md)",
            }}
          >
            <div
              className="mb-2 font-semibold"
              style={{ color: "var(--text-primary)", fontSize: "12px" }}
            >
              {t("chat").selectAgent}
            </div>
            <div className="flex flex-col gap-1">
              {(contacts ?? []).slice(0, 6).map((agent: { id: string; name: string }) => (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent.id)}
                  className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors w-full text-left"
                  style={{ color: "var(--text-primary)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <span
                    className="flex items-center justify-center text-white font-medium rounded-full flex-shrink-0"
                    style={{
                      width: "22px",
                      height: "22px",
                      background: getAgentColor(agent.name ?? ""),
                      fontSize: "8px",
                    }}
                  >
                    {(agent.name ?? "?")[0]?.toUpperCase()}
                  </span>
                  {agent.name}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowNewChatDialog(false)}
              className="mt-2 w-full rounded-md py-2 text-xs transition-colors"
              style={{
                color: "var(--text-tertiary)",
                background: "var(--bg-hover)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-active)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
            >
              {t("common").cancel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
