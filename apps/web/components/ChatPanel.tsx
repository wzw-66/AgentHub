"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@/lib/chat-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import { MessageBubble } from "@agenthub/ui";
import type { Message } from "@agenthub/shared";
import MentionPopup from "./MentionPopup";
import TypingIndicator from "./TypingIndicator";
import { useRipple } from "@/hooks/useRipple";
import { MarkdownRenderer } from "./MarkdownRenderer";

// ─── Helpers ───────────────────────────────────────────────────────────

function MessageContent({ message }: { message: Message }) {
  return <MarkdownRenderer content={message.content} />;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function ChatPanel({
  conversationId,
}: {
  conversationId: string | null;
  onShowArtifact?: (id: string) => void;
  onShowAgent?: (id: string) => void;
}) {
  const { messages, conversations, isLoadingMessages, sendMessage, contacts, streamingMessage, setMessages } = useChat();
  const { user } = useAuth();
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionState, setMentionState] = useState<{ atIndex: number; query: string } | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { addRipple, renderRipples } = useRipple();

  // ─── Message edit / delete state ─────────────────────────────────
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // ─── Reply state ────────────────────────────────────────────────
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const replyTargetMessage = replyTargetId
    ? messages.find((m) => m.id === replyTargetId) ?? null
    : null;

  const activeConversation = (conversations || []).find((c) => c.id === conversationId);
  const isGroupChat = activeConversation?.type === "group";

  // Determine the last user message index
  const lastUserMsgIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.senderType?.toLowerCase?.() === "user") return i;
    }
    return -1;
  })();

  // ─── Auto-scroll ────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // ─── @mention detection ─────────────────────────────────────────
  useEffect(() => {
    if (!isGroupChat || !textareaRef.current) {
      setMentionState(null);
      return;
    }
    const cursorPos = textareaRef.current.selectionStart;
    const beforeCursor = input.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex === -1) { setMentionState(null); return; }
    if (atIndex > 0 && beforeCursor[atIndex - 1] !== " " && beforeCursor[atIndex - 1] !== "\n") {
      setMentionState(null); return;
    }
    const query = beforeCursor.slice(atIndex + 1);
    if (query.includes(" ")) { setMentionState(null); return; }
    setMentionState({ atIndex, query });
    setMentionSelectedIndex(0);
  }, [input, isGroupChat]);

  function handleMentionSelect(agentName: string) {
    if (mentionState === null) return;
    const before = input.slice(0, mentionState.atIndex);
    const after = input.slice(textareaRef.current?.selectionStart ?? input.length);
    setInput(`${before}@${agentName} ${after}`);
    setMentionState(null);
    textareaRef.current?.focus();
  }

  // ─── Send ───────────────────────────────────────────────────────
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !conversationId || sending) return;
    setSending(true);
    try {
      await sendMessage(conversationId, trimmed, replyTargetId ?? undefined);
      setInput("");
      setReplyTargetId(null);
      textareaRef.current?.focus();
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionState) {
      const filtered = (contacts || []).filter((a) =>
        a.name.toLowerCase().includes(mentionState.query),
      );
      if (filtered.length > 0) {
        switch (e.key) {
          case "ArrowDown": e.preventDefault(); setMentionSelectedIndex((p) => (p + 1) % filtered.length); return;
          case "ArrowUp": e.preventDefault(); setMentionSelectedIndex((p) => (p - 1 + filtered.length) % filtered.length); return;
          case "Enter": case "Tab": e.preventDefault(); handleMentionSelect(filtered[mentionSelectedIndex]!.name); return;
          case "Escape": e.preventDefault(); setMentionState(null); return;
        }
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ─── Message edit / delete handlers ─────────────────────────────

  function startEditing(msg: Message) {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    // Focus the edit textarea on next render
    setTimeout(() => editTextareaRef.current?.focus(), 0);
  }

  async function handleSaveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed || !editingMessageId || !conversationId) return;

    try {
      await api.patch(
        `/api/conversations/${conversationId}/messages/${editingMessageId}/update`,
        { content: trimmed },
      );
      // Update local messages array
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingMessageId ? { ...m, content: trimmed } : m,
        ),
      );
      setEditingMessageId(null);
      setEditContent("");
    } catch {
      // silent
    }
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setEditContent("");
  }

  async function handleDelete(msgId: string) {
    if (!conversationId) return;
    try {
      await api.delete(
        `/api/conversations/${conversationId}/messages/${msgId}/delete`,
      );
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      setShowDeleteConfirm(null);
    } catch {
      // silent
    }
  }

  // ─── Empty state ────────────────────────────────────────────────
  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center" style={{ backgroundColor: "var(--theme-bg-glass-panel)" }}>
        <div className="text-center animate-fade-in-up">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl mb-4 hover-glow"
            style={{
              backgroundColor: "var(--theme-accent-dim)",
              border: "1px solid var(--theme-border-light)",
            }}
          >
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="var(--theme-accent)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
            {t("chat").empty}
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: "var(--theme-bg-glass-panel)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--theme-border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold hover-lift-sm"
            style={{
              backgroundColor: "var(--theme-accent-dim)",
              color: "var(--theme-accent)",
              border: "1px solid var(--theme-border-light)",
            }}
          >
            {activeConversation?.title?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: "var(--theme-text-primary)" }}>
              {activeConversation?.title || t("common").loading}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="inline-block h-2 w-2 rounded-full pulse-glow"
                style={{ backgroundColor: "var(--theme-accent)" }}
              />
              <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
                {isGroupChat
                  ? `${t("chat").groupSession} (${activeConversation?.contactIds?.length ?? 0})`
                  : t("chat").directChannel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {t("chat").loadingMessages}
            </span>
          </div>
        ) : messages.length === 0 && !streamingMessage ? (
          <div className="flex h-full items-center justify-center">
            <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-text-muted)" }}>
              {t("chat").noMessages}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg, idx) => {
              const senderType = msg.senderType?.toLowerCase?.() ?? "";
              const variant =
                senderType === "user" ? "user" :
                senderType === "system" ? "system" : "contact";

              const isLastUserMsg = idx === lastUserMsgIdx;
              const isEditing = editingMessageId === msg.id;
              const parentMessage = msg.parentId
                ? messages.find((m) => m.id === msg.parentId) ?? null
                : null;

              return (
                <div
                  key={msg.id}
                  className="relative animate-fade-in-up message-bubble group"
                  style={{
                    alignSelf: variant === "user" ? "flex-end" : variant === "system" ? "center" : "flex-start",
                    animationDelay: `${Math.min(idx * 15, 200)}ms`,
                  }}
                  onMouseEnter={() => setHoveredMsgId(msg.id)}
                  onMouseLeave={() => setHoveredMsgId(null)}
                >
                  <MessageBubble message={msg} variant={variant} parentMessage={parentMessage}>
                    {variant !== "system" && (
                      <div
                        className="font-mono text-xs mb-1"
                        style={{ color: "var(--theme-text-muted)", opacity: 0.8 }}
                      >
                        {variant === "user"
                          ? user?.username ?? t("chat").you
                          : contacts?.find((c) => c.id === msg.senderId)?.name ?? msg.senderId
                        }
                      </div>
                    )}
                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <textarea
                          ref={editTextareaRef}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full resize-none rounded border bg-transparent px-2 py-1 font-mono text-sm outline-none"
                          style={{ borderColor: "var(--theme-accent)", color: "var(--theme-text-primary)" }}
                          rows={3}
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={handleCancelEdit}
                            className="rounded px-2 py-1 font-mono text-xs"
                            style={{ color: "var(--theme-text-muted)" }}
                          >
                            {t("common").cancel}
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            disabled={!editContent.trim()}
                            className="rounded px-2 py-1 font-mono text-xs font-bold disabled:opacity-50"
                            style={{
                              color: "var(--theme-accent)",
                              backgroundColor: "var(--theme-accent-dim)",
                            }}
                          >
                            {t("common").save}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <MessageContent message={msg} />
                    )}
                  </MessageBubble>

                  {/* Hover actions: reply on all messages, edit/delete on last user message */}
                  {variant !== "system" && hoveredMsgId === msg.id && !isEditing && (
                    <div
                      className="absolute flex gap-1"
                      style={{ right: 0, top: 0, transform: "translateX(calc(100% + 8px))", zIndex: 10 }}
                    >
                      <button
                        onClick={() => setReplyTargetId(msg.id)}
                        className="flex h-7 w-7 items-center justify-center rounded text-xs transition-colors"
                        style={{ color: "var(--theme-text-muted)" }}
                        title="Reply"
                        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                      >
                        ↩
                      </button>
                      {variant === "contact" && (
                        <button
                          onClick={async () => {
                            try {
                              await api.post(
                                `/api/conversations/${conversationId}/messages/${msg.id}/regenerate`
                              );
                            } catch { /* silent */ }
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded text-xs transition-colors"
                          style={{ color: "var(--theme-text-muted)" }}
                          title="Regenerate"
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                        >
                          🔄
                        </button>
                      )}
                      {isLastUserMsg && (
                        <>
                          <button
                            onClick={() => startEditing(msg)}
                            className="flex h-7 w-7 items-center justify-center rounded text-xs transition-colors"
                            style={{ color: "var(--theme-text-muted)" }}
                            title={t("common").edit}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-accent)"; e.currentTarget.style.backgroundColor = "var(--theme-accent-dim)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(msg.id)}
                            className="flex h-7 w-7 items-center justify-center rounded text-xs transition-colors"
                            style={{ color: "var(--theme-text-muted)" }}
                            title={t("common").delete}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--theme-danger)"; e.currentTarget.style.backgroundColor = "rgba(255,51,85,0.1)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--theme-text-muted)"; e.currentTarget.style.backgroundColor = "transparent"; }}
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Delete confirmation */}
                  {showDeleteConfirm === msg.id && (
                    <div
                      className="mt-1 flex items-center gap-2 justify-end"
                      style={{
                        width: "fit-content",
                        marginLeft: variant === "user" ? "auto" : variant === "system" ? "auto" : undefined,
                        marginRight: variant === "system" ? "auto" : undefined,
                      }}
                    >
                      <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                        {t("common").confirm}?
                      </span>
                      <button
                        onClick={() => handleDelete(msg.id)}
                        className="rounded px-2 py-0.5 font-mono text-xs"
                        style={{ color: "var(--theme-danger)", backgroundColor: "rgba(255,51,85,0.1)" }}
                      >
                        {t("common").delete}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(null)}
                        className="rounded px-2 py-0.5 font-mono text-xs"
                        style={{ color: "var(--theme-text-muted)" }}
                      >
                        {t("common").cancel}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Streaming message */}
            {streamingMessage && (
              <div className="animate-fade-in-up message-bubble" style={{ alignSelf: "flex-start" }}>
                <MessageBubble message={streamingMessage} variant="contact">
                  <div>
                    <div
                      className="font-mono text-xs mb-1"
                      style={{ color: "var(--theme-text-muted)", opacity: 0.8 }}
                    >
                      {contacts?.find((c) => c.id === streamingMessage.senderId)?.name ?? streamingMessage.senderId}
                    </div>
                    <span>
                      {streamingMessage.content}
                      <span
                        className="ml-0.5 inline-block h-4 w-2 align-text-bottom"
                        style={{
                          backgroundColor: "var(--theme-accent)",
                          animation: "cursor-blink 1s step-end infinite",
                        }}
                      />
                    </span>
                  </div>
                </MessageBubble>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Typing Indicator */}
      <TypingIndicator />

      {/* Input area */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid var(--theme-border)" }}
      >
        {/* Reply quote bar */}
        {replyTargetMessage && (
          <div
            className="flex items-center gap-2 px-3 py-2 mb-2"
            style={{
              borderLeft: "3px solid var(--theme-accent)",
              backgroundColor: "var(--theme-accent-dim)",
              borderRadius: "0 8px 8px 0",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-mono text-xs font-bold" style={{ color: "var(--theme-accent)" }}>
                {t("chat").replyingTo} {replyTargetMessage.senderId}
              </div>
              <div className="font-mono text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>
                {replyTargetMessage.content.slice(0, 120)}
              </div>
            </div>
            <button
              onClick={() => setReplyTargetId(null)}
              className="flex-shrink-0 rounded p-1"
              style={{ color: "var(--theme-text-muted)" }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-2">
          <div
            className="flex items-center font-mono text-sm font-bold tracking-wider flex-shrink-0 mb-2"
            style={{ color: "var(--theme-accent)" }}
          >
            $<span className="cursor-blink ml-0.5" style={{ color: "var(--theme-accent)" }}>▌</span>
          </div>

          {mentionState && (
            <MentionPopup
              searchQuery={mentionState.query}
              selectedIndex={mentionSelectedIndex}
              onSelect={handleMentionSelect}
              onHover={setMentionSelectedIndex}
            />
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="chat-textarea flex-1 resize-none border-b bg-transparent py-2 font-mono text-sm rounded-none"
            rows={1}
            placeholder={isGroupChat ? t("chat").mentionPlaceholder : t("chat").messagePlaceholder}
            disabled={sending}
          />

          <button
            onClick={handleSend}
            onMouseDown={addRipple}
            disabled={!input.trim() || sending}
            className="btn-send flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ position: "relative", overflow: "hidden" }}
          >
            {renderRipples()}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
