"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/lib/chat-context";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Conversation } from "@agenthub/shared";

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string | null) => void;
}

type ChatMode = "single" | "group";

function getDisplayName(conv: Conversation): string {
  return conv.title || "UNTITLED";
}

function getLastActive(conv: Conversation): string | undefined {
  return conv.lastMessageAt
    ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : undefined;
}

export default function Sidebar({
  activeConversationId,
  onSelectConversation,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const { conversations, contacts, isLoadingConversations, createConversation, fetchConversations, togglePinConversation, toggleArchiveConversation } = useChat();
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("single");
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [hoveredConvId, setHoveredConvId] = useState<string | null>(null);
  const [deleteConfirmConvId, setDeleteConfirmConvId] = useState<string | null>(null);
  const [deletingConv, setDeletingConv] = useState(false);

  const filteredConversations = (conversations || [])
    .filter((c) => {
      const matchesSearch = getDisplayName(c).toLowerCase().includes(searchQuery.toLowerCase());
      const matchesArchive = showArchived || !c.isArchived;
      return matchesSearch && matchesArchive;
    })
    .sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });

  function resetModal() {
    setShowNewChat(false);
    setNewChatTitle("");
    setChatMode("single");
    setSelectedAgentIds(new Set());
  }

  function toggleAgentSelection(id: string) {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreateConversation(contactId: string) {
    setCreating(true);
    try {
      // Check if a single conversation with this agent already exists
      const existing = await api.get<{ conversation: { id: string } | null }>(
        `/api/conversations/find-by-agent/${contactId}`,
      );
      if (existing.conversation) {
        onSelectConversation(existing.conversation.id);
        resetModal();
        return;
      }

      const conv = await createConversation(
        newChatTitle || `SESSION:${contactId.slice(0, 8)}`,
        "single",
        [contactId],
      );
      onSelectConversation(conv.id);
      resetModal();
      fetchConversations();
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  async function handleCreateGroup() {
    if (selectedAgentIds.size < 2) return;
    setCreating(true);
    try {
      const agentIds = Array.from(selectedAgentIds);
      const namePreview = contacts
        ?.filter((c) => agentIds.includes(c.id))
        .map((c) => c.name)
        .slice(0, 3)
        .join(", ");
      const conv = await createConversation(
        newChatTitle || `GROUP: ${namePreview}...`,
        "group",
        agentIds,
      );
      onSelectConversation(conv.id);
      resetModal();
      fetchConversations();
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteConversation(convId: string) {
    setDeletingConv(true);
    try {
      await api.delete(`/api/conversations/${convId}/delete`);
      fetchConversations();
      if (activeConversationId === convId) {
        onSelectConversation(null);
      }
    } catch {
      // silent
    } finally {
      setDeleteConfirmConvId(null);
      setDeletingConv(false);
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{
        backgroundColor: "var(--theme-bg-glass-panel)",
        borderRight: "1px solid var(--theme-border)",
      }}
    >
      {/* User info bar */}
      <div className="flex items-center justify-between px-4 py-3.5" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold hover-lift-sm"
            style={{
              backgroundColor: "var(--theme-accent-dim)",
              color: "var(--theme-accent)",
              border: "1px solid var(--theme-border-light)",
            }}
          >
            {user?.username?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--theme-text-primary)" }}>
              {user?.username || "AGENT"}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full pulse-glow" style={{ backgroundColor: "var(--theme-accent)" }} />
              <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                {t("sidebar").operator}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={logout}
          className="btn-ghost rounded-lg px-2.5 py-1.5 font-mono text-xs tracking-wider"
          title={t("sidebar").exit}
        >
          {t("sidebar").exit}
        </button>
      </div>

      {/* Quick nav */}
      <div className="flex items-center gap-1.5 px-3 py-2.5" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        {[
          { path: "/chat", label: t("sidebar").chat },
          { path: "/agents", label: t("sidebar").agents },
          { path: "/agents/contacts", label: t("sidebar").contacts },
        ].map((nav) => (
          <button
            key={nav.path}
            onClick={() => router.push(nav.path)}
            className="nav-btn flex-1 rounded-lg px-3 py-1.5 font-mono text-xs tracking-wider"
          >
            {nav.label}
          </button>
        ))}
      </div>

      {/* Search + New session */}
      <div className="px-3 py-2.5 space-y-2" style={{ borderBottom: "1px solid var(--theme-border)" }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("sidebar").search}
          className="input-theme w-full rounded-xl border bg-transparent px-3.5 py-2 font-mono text-xs tracking-wider"
        />
        <label className="flex items-center gap-2 cursor-pointer px-1" onClick={() => setShowArchived(!showArchived)}>
          <div
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border"
            style={{
              borderColor: showArchived ? "var(--theme-accent)" : "var(--theme-border-light)",
              backgroundColor: showArchived ? "var(--theme-accent)" : "transparent",
            }}
          >
            {showArchived && (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="var(--theme-text-inverse)" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
            Show archived
          </span>
        </label>
        <button
          onClick={() => setShowNewChat(true)}
          className="btn-gradient flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 font-mono text-xs tracking-wider"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          {t("sidebar").newSession}
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-1">
        <div className="px-4 pb-1 pt-4" style={{ borderBottom: "1px solid var(--theme-border)" }}>
          <span className="font-mono text-xs tracking-widest font-semibold" style={{ color: "var(--theme-text-secondary)" }}>
            {t("sidebar").sessions}
          </span>
        </div>
        {isLoadingConversations ? (
          <div className="px-4 py-8 text-center">
            <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
              {t("common").loading}
            </span>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
              {searchQuery ? t("sidebar").noMatches : t("sidebar").noSessions}
            </span>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const isActive = activeConversationId === conv.id;
            const isHovered = hoveredConvId === conv.id;
            const isDeleteConfirm = deleteConfirmConvId === conv.id;
            return (
              <div
                key={conv.id}
                className="relative group"
                onMouseEnter={() => setHoveredConvId(conv.id)}
                onMouseLeave={() => setHoveredConvId(null)}
              >
                <button
                  onClick={() => onSelectConversation(conv.id)}
                  className={`sidebar-item w-full text-left ${isActive ? "active" : ""}`}
                >
                  <div className="flex items-center gap-3 pl-6 pr-4 py-2.5">
                    {/* Icon: group vs single */}
                    <div
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-xs"
                      style={{
                        backgroundColor: isActive ? "var(--theme-accent-dim)" : "var(--theme-bg-elevated)",
                        color: isActive ? "var(--theme-accent)" : "var(--theme-text-muted)",
                      }}
                    >
                      {conv.type === "group" ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      ) : (
                        <span className="text-xs font-bold">{getDisplayName(conv).charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span
                          className="font-mono text-xs tracking-tight truncate"
                          style={{
                            color: isActive ? "var(--theme-accent)" : "var(--theme-text-muted)",
                            fontWeight: isActive ? 700 : 400,
                          }}
                        >
                          {getDisplayName(conv)}
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {getLastActive(conv) && !isHovered && (
                            <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                              {getLastActive(conv)}
                            </span>
                          )}
                          {/* Pin indicator when not hovered */}
                          {conv.isPinned && !isHovered && (
                            <span className="flex items-center" style={{ color: "var(--theme-accent)" }}>
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 3h14l-5 7 5 7H5" />
                              </svg>
                            </span>
                          )}
                          {/* Hover actions */}
                          {isHovered && !isDeleteConfirm && (
                            <span className="flex items-center gap-0.5">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePinConversation(conv.id, conv.isPinned);
                                }}
                                className="rounded p-1 transition-colors cursor-pointer"
                                style={{ color: conv.isPinned ? "var(--theme-accent)" : "var(--theme-text-muted)" }}
                                title={conv.isPinned ? "Unpin" : "Pin to top"}
                                role="button"
                                tabIndex={0}
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v18M5 3h14l-5 7 5 7H5" />
                                </svg>
                              </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleArchiveConversation(conv.id, conv.isArchived);
                                }}
                                className="rounded p-1 transition-colors cursor-pointer"
                                style={{ color: "var(--theme-text-muted)" }}
                                title={conv.isArchived ? "Unarchive" : "Archive"}
                                role="button"
                                tabIndex={0}
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                              </span>
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmConvId(conv.id);
                                }}
                                className="rounded p-1 transition-colors cursor-pointer"
                                style={{ color: "var(--theme-text-muted)" }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLElement).style.color = "var(--theme-danger)";
                                  (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(255,51,85,0.1)";
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLElement).style.color = "var(--theme-text-muted)";
                                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                                }}
                                title="Delete"
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.stopPropagation();
                                    setDeleteConfirmConvId(conv.id);
                                  }
                                }}
                              >
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </span>
                            </span>
                          )}
                        </div>
                      </div>
                      {conv.type === "group" && (
                        <span className="font-mono text-[10px] tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                          {t("sidebar").newSessionModal.members(conv.contactIds?.length ?? 0)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {/* Delete confirmation */}
                {isDeleteConfirm && (
                  <div
                    className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2 rounded-lg border px-3 py-2 shadow-lg"
                    style={{
                      backgroundColor: "var(--theme-bg-surface)",
                      borderColor: "var(--theme-border)",
                    }}
                  >
                    <span className="font-mono text-xs whitespace-nowrap" style={{ color: "var(--theme-text-muted)" }}>
                      Confirm?
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      disabled={deletingConv}
                      className="rounded px-2 py-1 font-mono text-xs font-bold disabled:opacity-50"
                      style={{ backgroundColor: "var(--theme-danger)", color: "#ffffff" }}
                    >
                      {deletingConv ? "..." : "Delete"}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmConvId(null);
                      }}
                      className="rounded px-2 py-1 font-mono text-xs"
                      style={{ color: "var(--theme-text-muted)" }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Theme + Language switcher at bottom */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderTop: "1px solid var(--theme-border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tracking-wider section-header" style={{ color: "var(--theme-text-muted)" }}>
            {t("sidebar").theme}
          </span>
          <ThemeSwitcher />
        </div>
        <LanguageSwitcher />
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        >
          <div className="w-96 card-panel p-6 shadow-2xl">
            <h3 className="mb-1 font-mono text-base font-semibold text-gradient" style={{ color: "var(--theme-text-primary)" }}>
              {t("sidebar").newSessionModal.title}
            </h3>
            <p className="mb-4 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {t("sidebar").newSessionModal.subtitle}
            </p>

            {/* Mode toggle */}
            <div className="mb-4 flex rounded-lg border p-0.5" style={{ borderColor: "var(--theme-border-light)", backgroundColor: "var(--theme-bg-primary)" }}>
              <button
                onClick={() => { setChatMode("single"); setSelectedAgentIds(new Set()); }}
                className="flex-1 rounded-md px-3 py-1.5 font-mono text-xs tracking-wider transition-all"
                style={{
                  backgroundColor: chatMode === "single" ? "var(--theme-accent)" : "transparent",
                  color: chatMode === "single" ? "var(--theme-text-inverse)" : "var(--theme-text-secondary)",
                }}
              >
                {t("sidebar").newSessionModal.singleMode}
              </button>
              <button
                onClick={() => { setChatMode("group"); setSelectedAgentIds(new Set()); }}
                className="flex-1 rounded-md px-3 py-1.5 font-mono text-xs tracking-wider transition-all"
                style={{
                  backgroundColor: chatMode === "group" ? "var(--theme-accent)" : "transparent",
                  color: chatMode === "group" ? "var(--theme-text-inverse)" : "var(--theme-text-secondary)",
                }}
              >
                {t("sidebar").newSessionModal.groupMode}
              </button>
            </div>

            <input
              type="text"
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
              placeholder={t("sidebar").newSessionModal.sessionName}
              className="input-theme mb-4 w-full rounded-xl border bg-transparent px-3.5 py-2.5 font-mono text-xs tracking-wider"
            />

            <div className="mb-4">
              <p className="section-header mb-3 font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                {t("sidebar").newSessionModal.availableAgents}
              </p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {contacts.length === 0 ? (
                  <p className="py-4 text-center font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                    {t("sidebar").newSessionModal.noAgents}
                  </p>
                ) : (
                  contacts.map((contact) => {
                    const isSelected = selectedAgentIds.has(contact.id);
                    return (
                      <button
                        key={contact.id}
                        onClick={() => {
                          if (chatMode === "single") {
                            handleCreateConversation(contact.id);
                          } else {
                            toggleAgentSelection(contact.id);
                          }
                        }}
                        className="agent-item flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left"
                        style={{ color: "var(--theme-text-primary)" }}
                      >
                        {/* Checkbox for group mode */}
                        {chatMode === "group" && (
                          <div
                            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border"
                            style={{
                              borderColor: isSelected ? "var(--theme-accent)" : "var(--theme-border-light)",
                              backgroundColor: isSelected ? "var(--theme-accent)" : "transparent",
                            }}
                          >
                            {isSelected && (
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="var(--theme-text-inverse)" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold flex-shrink-0"
                          style={{
                            backgroundColor: "var(--theme-accent-dim)",
                            color: "var(--theme-accent)",
                            border: "1px solid var(--theme-border-light)",
                          }}
                        >
                          {contact.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{contact.name}</p>
                          <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                            {contact.provider}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={resetModal}
                className="btn-ghost rounded-xl border px-5 py-2.5 font-mono text-xs tracking-wider"
                style={{
                  borderColor: "var(--theme-border-light)",
                  color: "var(--theme-text-secondary)",
                }}
              >
                {t("common").cancel}
              </button>

              {/* Group create button */}
              {chatMode === "group" && (
                <button
                  onClick={handleCreateGroup}
                  disabled={selectedAgentIds.size < 2 || creating}
                  className="rounded-xl border px-5 py-2.5 font-mono text-xs font-bold tracking-wider transition-all disabled:opacity-40"
                  style={{
                    borderColor: "var(--theme-accent)",
                    color: "var(--theme-accent)",
                    backgroundColor: "var(--theme-accent-dim)",
                  }}
                >
                  {selectedAgentIds.size < 2
                    ? t("sidebar").newSessionModal.minAgents
                    : creating
                      ? t("common").loading
                      : t("sidebar").newSessionModal.createGroup}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
