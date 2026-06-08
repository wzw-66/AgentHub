"use client";

import { useState, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import type { Conversation } from "@agenthub/shared";

interface ChatListViewProps {
  conversations: Conversation[];
  contacts?: { id: string; name: string }[];
  isLoadingConversations: boolean;
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  togglePinConversation: (conversationId: string, isPinned: boolean) => Promise<void>;
  toggleArchiveConversation: (conversationId: string, isArchived: boolean) => Promise<void>;
}

/** Palette of warm, distinguishable agent avatar colors. */
const AGENT_PALETTE = [
  "#1a1a2e", "#b8860b", "#2b8a6b", "#7c3aed", "#c93a3a",
  "#2563eb", "#c2410c", "#059669", "#6d28d9", "#be185d",
];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length]!;
}

export default function ChatListView({
  conversations,
  contacts,
  isLoadingConversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  togglePinConversation,
  toggleArchiveConversation,
}: ChatListViewProps) {
  const contactsMap = useMemo(
    () => new Map(contacts?.map((c) => [c.id, c.name]) ?? []),
    [contacts],
  );
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const filteredConversations = useMemo(
    () => conversations.filter((c) => c.title.toLowerCase().includes(searchQuery.toLowerCase())),
    [conversations, searchQuery],
  );

  async function handleDelete(convId: string) {
    await onDeleteConversation(convId);
    setDeleteConfirmId(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
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
          className="flex-1 bg-transparent text-xs outline-none focus-visible:outline-none"
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

      {/* Conversation list */}
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
            const isHovered = hoveredConvId === conv.id;
            const isDeleteConfirm = deleteConfirmId === conv.id;
            return (
              <div
                key={conv.id}
                style={{ position: "relative" }}
                onMouseEnter={() => setHoveredConvId(conv.id)}
                onMouseLeave={() => setHoveredConvId(null)}
              >
                <button
                  onClick={() => onSelectConversation(conv.id)}
                  className="w-full text-left transition-all"
                  style={{
                    padding: "11px 12px",
                    borderRadius: "var(--radius-md)",
                    cursor: "pointer",
                    marginBottom: "2px",
                    position: "relative",
                    background: isActive ? "var(--bg-active)" : isHovered ? "var(--bg-hover)" : "transparent",
                    transition: "all 0.18s ease",
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
                      className="truncate flex items-center gap-1.5"
                      style={{
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                      }}
                    >
                      {conv.isPinned && (
                        <svg className="h-3 w-3 flex-shrink-0" fill="var(--text-tertiary)" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      )}
                      {conv.isArchived && (
                        <span style={{ fontSize: "9px", color: "var(--text-tertiary)" }}>📦</span>
                      )}
                      {conv.type === "group" && (
                        <span
                          className="flex items-center justify-center flex-shrink-0"
                          style={{
                            fontSize: "7px",
                            fontWeight: 600,
                            color: "var(--accent)",
                            border: "1px solid var(--accent)",
                            borderRadius: "4px",
                            padding: "0 4px",
                            height: "14px",
                            lineHeight: "14px",
                          }}
                        >
                          群
                        </span>
                      )}
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
                  {conv.contactIds && conv.contactIds.length > 0 && (
                    <div className="flex gap-0.5" style={{ marginTop: "5px" }}>
                      {conv.contactIds.slice(0, 3).map((contactId, i) => {
                        const agentName = contactsMap.get(contactId) ?? contactId;
                        return (
                          <span
                            key={contactId ?? i}
                            className="flex items-center justify-center text-white"
                            style={{
                              width: "16px",
                              height: "16px",
                              borderRadius: "50%",
                              fontSize: "7px",
                              background: getAgentColor(agentName),
                              border: "1.5px solid var(--bg-sidebar)",
                            }}
                          >
                            {(agentName[0] ?? "?").toUpperCase()}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </button>

                {/* Hover actions: Pin / Archive / Delete */}
                {isHovered && !isDeleteConfirm && (
                  <div
                    className="flex items-center gap-0.5"
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "10px",
                      zIndex: 10,
                    }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePinConversation(conv.id, conv.isPinned ?? false); }}
                      className="flex items-center justify-center rounded transition-colors"
                      style={{
                        width: "22px", height: "22px",
                        color: conv.isPinned ? "var(--accent)" : "var(--text-tertiary)",
                        background: "var(--bg-app)",
                        fontSize: "9px",
                      }}
                      title={conv.isPinned ? "取消置顶" : "置顶"}
                    >
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleArchiveConversation(conv.id, conv.isArchived ?? false); }}
                      className="flex items-center justify-center rounded transition-colors"
                      style={{
                        width: "22px", height: "22px",
                        color: "var(--text-tertiary)",
                        background: "var(--bg-app)",
                        fontSize: "9px",
                      }}
                      title={conv.isArchived ? "取消归档" : "归档"}
                    >
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(conv.id); }}
                      className="flex items-center justify-center rounded transition-colors"
                      style={{
                        width: "22px", height: "22px",
                        color: "var(--text-tertiary)",
                        background: "var(--bg-app)",
                        fontSize: "9px",
                      }}
                      title="删除"
                    >
                      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Delete confirmation */}
                {isDeleteConfirm && (
                  <div
                    className="flex items-center gap-1.5"
                    style={{
                      position: "absolute",
                      top: "8px",
                      right: "10px",
                      zIndex: 10,
                    }}
                  >
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>确认?</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }}
                      className="rounded px-1.5 py-0.5 text-[10px] text-white"
                      style={{ background: "var(--red)" }}
                    >
                      删除
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }}
                      className="rounded px-1.5 py-0.5 text-[10px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Archived toggle */}
        {conversations.some((c) => c.isArchived) && (
          <div style={{ padding: "4px 14px" }}>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="w-full text-left text-[10px] transition-colors"
              style={{
                color: "var(--text-tertiary)",
                padding: "4px 8px",
                borderRadius: "var(--radius-sm)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; }}
            >
              {showArchived ? "▲ 隐藏已归档" : "▼ 显示已归档"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
