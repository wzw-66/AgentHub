"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useChat } from "@/lib/chat-context";
import { useI18n } from "@/lib/i18n";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { LanguageSwitcher } from "./LanguageSwitcher";
import type { Conversation } from "@agenthub/shared";

interface SidebarProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

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
  const { conversations, agents, isLoadingConversations, createConversation, fetchConversations } = useChat();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");

  const filteredConversations = (conversations || []).filter((c) =>
    getDisplayName(c).toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleCreateConversation(agentId: string) {
    try {
      const conv = await createConversation(
        newChatTitle || `SESSION:${agentId.slice(0, 8)}`,
        "single",
        [agentId],
      );
      onSelectConversation(conv.id);
      setShowNewChat(false);
      setNewChatTitle("");
      fetchConversations();
    } catch {
      // silent
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--theme-bg-secondary)", borderRight: "1px solid var(--theme-border)" }}
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
        <div className="section-header mx-4 mb-1">
          <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
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
            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`sidebar-item w-full text-left ${isActive ? "active" : ""}`}
              >
                <div className="px-4 py-2.5">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-mono tracking-tight truncate hover-text-glow"
                      style={{
                        color: isActive ? "var(--theme-accent)" : "var(--theme-text-primary)",
                        fontWeight: isActive ? 700 : 500,
                      }}
                    >
                      {getDisplayName(conv)}
                    </span>
                    {getLastActive(conv) && (
                      <span className="font-mono text-xs flex-shrink-0 ml-3" style={{ color: "var(--theme-text-muted)" }}>
                        {getLastActive(conv)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
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
                {agents.length === 0 ? (
                  <p className="py-4 text-center font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                    {t("sidebar").newSessionModal.noAgents}
                  </p>
                ) : (
                  agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleCreateConversation(agent.id)}
                      className="agent-item flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left"
                      style={{ color: "var(--theme-text-primary)" }}
                    >
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold flex-shrink-0"
                        style={{
                          backgroundColor: "var(--theme-accent-dim)",
                          color: "var(--theme-accent)",
                          border: "1px solid var(--theme-border-light)",
                        }}
                      >
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{agent.name}</p>
                        <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                          {agent.provider}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewChat(false)}
                className="btn-ghost rounded-xl border px-5 py-2.5 font-mono text-xs tracking-wider"
                style={{
                  borderColor: "var(--theme-border-light)",
                  color: "var(--theme-text-secondary)",
                }}
              >
                {t("common").cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
