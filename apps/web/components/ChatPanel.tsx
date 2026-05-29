"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@/lib/chat-context";
import { useI18n } from "@/lib/i18n";
import { MessageBubble, CodeBlock } from "@agenthub/ui";
import type { Message } from "@agenthub/shared";
import MentionPopup from "./MentionPopup";
import TypingIndicator from "./TypingIndicator";
import { useRipple } from "@/hooks/useRipple";

// ─── Helpers ───────────────────────────────────────────────────────────

interface CodeBlockMatch {
  isCode: boolean;
  code: string;
  language: string;
}

function isCodeBlock(content: string): CodeBlockMatch {
  const match = content.match(/^```(\w+)?\n([\s\S]*?)```$/);
  if (match) {
    return { isCode: true, code: match[2]!, language: match[1] || "text" };
  }
  return { isCode: false, code: content, language: "text" };
}

function MessageContent({ message }: { message: Message }) {
  const { isCode, code, language } = isCodeBlock(message.content);
  if (isCode) {
    return <CodeBlock code={code} language={language} />;
  }
  return <>{message.content}</>;
}

// ─── Component ─────────────────────────────────────────────────────────

export default function ChatPanel({
  conversationId,
}: {
  conversationId: string | null;
  onShowArtifact?: (id: string) => void;
  onShowAgent?: (id: string) => void;
}) {
  const { messages, conversations, isLoadingMessages, sendMessage, agents, streamingMessage } = useChat();
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionState, setMentionState] = useState<{ atIndex: number; query: string } | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { addRipple, renderRipples } = useRipple();

  const activeConversation = (conversations || []).find((c) => c.id === conversationId);
  const isGroupChat = activeConversation?.type === "group";

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
      await sendMessage(conversationId, trimmed);
      setInput("");
      textareaRef.current?.focus();
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionState) {
      const filtered = (agents || []).filter((a) =>
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
                {isGroupChat ? t("chat").groupSession : t("chat").directChannel}
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
              const variant =
                msg.senderType === "user" ? "user" :
                msg.senderType === "system" ? "system" : "contact";
              return (
                <div key={msg.id} className="animate-fade-in-up message-bubble" style={{ animationDelay: `${Math.min(idx * 15, 200)}ms` }}>
                  <MessageBubble message={msg} variant={variant}>
                    <MessageContent message={msg} />
                  </MessageBubble>
                </div>
              );
            })}
            {/* Streaming message */}
            {streamingMessage && (
              <div className="animate-fade-in-up message-bubble">
                <MessageBubble message={streamingMessage} variant="contact">
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
