"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@/lib/chat-context";
import { MessageBubble, CodeBlock } from "@agenthub/ui";
import type { Message } from "@agenthub/shared";
import MentionPopup from "./MentionPopup";
import TypingIndicator from "./TypingIndicator";

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
  const {
    messages,
    conversations,
    isLoadingMessages,
    sendMessage,
    agents,
    streamingMessage,
  } = useChat();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mentionState, setMentionState] = useState<{
    atIndex: number;
    query: string;
  } | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(
    (c) => c.id === conversationId,
  );
  const isGroupChat = activeConversation?.type === "group";

  // ─── Auto-scroll to bottom ──────────────────────────────────────
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

    if (atIndex === -1) {
      setMentionState(null);
      return;
    }

    // Check word boundary
    if (atIndex > 0 && beforeCursor[atIndex - 1] !== " " && beforeCursor[atIndex - 1] !== "\n") {
      setMentionState(null);
      return;
    }

    const query = beforeCursor.slice(atIndex + 1);
    if (query.includes(" ")) {
      setMentionState(null);
      return;
    }

    setMentionState({ atIndex, query });
    setMentionSelectedIndex(0);
  }, [input, isGroupChat]);

  // ─── Handle mention select ──────────────────────────────────────
  function handleMentionSelect(agentName: string) {
    if (mentionState === null) return;
    const before = input.slice(0, mentionState.atIndex);
    const after = input.slice(textareaRef.current?.selectionStart ?? input.length);
    const newText = `${before}@${agentName} ${after}`;
    setInput(newText);
    setMentionState(null);
    textareaRef.current?.focus();
  }

  // ─── Handle send ────────────────────────────────────────────────
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !conversationId || sending) return;

    setSending(true);
    try {
      await sendMessage(conversationId, trimmed);
      setInput("");
      textareaRef.current?.focus();
    } catch {
      // Handle error silently
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // If mention popup is open, intercept navigation keys
    if (mentionState) {
      const filtered = agents.filter((a) =>
        a.name.toLowerCase().includes(mentionState.query),
      );

      if (filtered.length > 0) {
        switch (e.key) {
          case "ArrowDown":
            e.preventDefault();
            setMentionSelectedIndex(
              (prev) => (prev + 1) % filtered.length,
            );
            return;
          case "ArrowUp":
            e.preventDefault();
            setMentionSelectedIndex(
              (prev) => (prev - 1 + filtered.length) % filtered.length,
            );
            return;
          case "Enter":
          case "Tab":
            e.preventDefault();
            handleMentionSelect(filtered[mentionSelectedIndex]!.name);
            return;
          case "Escape":
            e.preventDefault();
            setMentionState(null);
            return;
        }
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ─── Empty state: no conversation selected ──────────────────────
  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg
            className="mx-auto h-16 w-16 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-400">
            选择一个会话开始聊天
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-300 text-sm text-gray-600">
            {activeConversation?.title?.charAt(0).toUpperCase() || "?"}
          </div>
          <div>
            <span className="text-sm font-medium text-gray-900">
              {activeConversation?.title || "加载中..."}
            </span>
            {isGroupChat && (
              <span className="ml-2 text-xs text-gray-400">群聊</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">消息加载中...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">暂无消息，开始聊天吧</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map((msg) => {
              const variant =
                msg.senderType === "user"
                  ? "user"
                  : msg.senderType === "system"
                    ? "system"
                    : "contact";
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  variant={variant}
                >
                  <MessageContent message={msg} />
                </MessageBubble>
              );
            })}
            {/* Streaming message */}
            {streamingMessage && (
              <MessageBubble
                message={streamingMessage}
                variant="contact"
              >
                <span>
                  {streamingMessage.content}
                  <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-gray-400" />
                </span>
              </MessageBubble>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Typing Indicator */}
      <TypingIndicator />

      {/* Input */}
      <div className="border-t border-gray-200 px-4 py-3">
        <div className="relative flex items-end gap-2">
          {/* Mention Popup */}
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
            className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            rows={2}
            placeholder={
              isGroupChat
                ? "输入消息... (@提及 Agent)"
                : "输入消息... (Enter 发送, Shift+Enter 换行)"
            }
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19V5m0 0l-7 7m7-7l7 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
