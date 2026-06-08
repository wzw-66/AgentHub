"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useChat } from "@/lib/chat-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import type { Message } from "@agenthub/shared";
import TypingIndicator from "./TypingIndicator";
import { MarkdownRenderer } from "./MarkdownRenderer";
import MentionPopup from "./MentionPopup";
import DeployCard from "./DeployCard";
import HesitateBubble from "./HesitateBubble";
import DebateTable from "./DebateTable";
import SilentAlertCard from "./SilentAlertCard";
import DiffCard from "./DiffCard";
import ArtifactCardComponent from "./ArtifactCard";
import ArtifactPreviewModal from "./ArtifactPreviewModal";

// ─── Agent color generator ──────────────────────────────────────────────

/** Palette of warm, distinguishable agent avatar colors. */
const AGENT_PALETTE = [
  "#1a1a2e", "#b8860b", "#2b8a6b", "#7c3aed", "#c93a3a",
  "#2563eb", "#c2410c", "#059669", "#6d28d9", "#be185d",
];

/** Generate a consistent color for an agent based on its ID hash. */
function getAgentColor(agentId?: string): string {
  if (!agentId) return "var(--accent)";
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) {
    hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length]!;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function MessageContent({
  message,
  onShowArtifact,
}: {
  message: Message;
  onShowArtifact?: (artifactId: string) => void;
}) {
  switch (message.type) {
    case "deploy":
      return <DeployCard url={message.content} status="running" />;
    case "hesitate":
      return (
        <HesitateBubble
          agentName={message.senderId}
          color="var(--accent)"
          risks={[]}
          options={[{ id: "continue", label: "继续", primary: true }]}
          onSelect={() => {}}
        />
      );
    case "debate":
      return <DebateTable columns={[]} rows={[]} conclusion={message.content} />;
    case "alert":
      return (
        <SilentAlertCard
          severity="medium"
          description={message.content}
          filePath={message.senderId}
          suggestion=""
        />
      );
    case "diff":
      return <DiffCard content={message.content} />;
    case "artifact": {
      const firstArtifact = (message as Message & { artifacts?: Array<{ id: string }> }).artifacts?.[0];
      return (
        <ArtifactCardComponent
          content={message.content}
          title={firstArtifact?.id ? `Artifact #${firstArtifact.id.slice(0, 8)}` : "Artifact"}
          onPreview={firstArtifact && onShowArtifact ? () => onShowArtifact(firstArtifact.id) : undefined}
        />
      );
    }
    case "preview":
      return (
        <div
          className="rounded-lg overflow-hidden text-xs"
          style={{ border: "1px solid var(--border-light)" }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2 font-medium"
            style={{ background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-light)", color: "var(--text-primary)" }}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span>链接预览</span>
          </div>
          <div className="px-3 py-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            <MarkdownRenderer content={message.content} />
          </div>
        </div>
      );
    default:
      return <MarkdownRenderer content={message.content} />;
  }
}

// ─── Component ─────────────────────────────────────────────────────────

export default function ChatPanel({
  conversationId,
  onShowArtifact,
  onShowAgent: _onShowAgent,
}: {
  conversationId: string | null;
  onShowArtifact?: (id: string) => void;
  onShowAgent?: (id: string) => void;
}) {
  const { messages, conversations, isLoadingMessages, sendMessage, contacts, streamingMessages, streamError, setStreamError, setMessages } = useChat();
  const allStreamingMessages = [...streamingMessages.values()];
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  // ─── File attachment handler ─────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAttachmentError(null);

    if (file.size > MAX_FILE_SIZE) {
      setAttachmentError(`文件超过 5MB 限制 (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const markdownImage = `![${file.name}](${dataUrl})`;
      setInput((prev) => (prev ? `${prev}\n${markdownImage}` : markdownImage));
      setAttachmentError(null);
      setTimeout(() => textareaRef.current?.focus(), 0);
    };
    reader.onerror = () => {
      setAttachmentError("文件读取失败");
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ─── Message edit / delete state ─────────────────────────────────
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // ─── Reply state ────────────────────────────────────────────────
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);

  function handleShowArtifact(artifactId: string) {
    setPreviewArtifactId(artifactId);
    onShowArtifact?.(artifactId);
  }

  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const replyTargetMessage = replyTargetId
    ? messages.find((m) => m.id === replyTargetId) ?? null
    : null;

  const activeConversation = (conversations || []).find((c) => c.id === conversationId);
  const isGroupChat = activeConversation?.type === "group";

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
  }, [messages, allStreamingMessages, scrollToBottom]);

  // ─── @mention detection ─────────────────────────────────────────
  useEffect(() => {
    if (!isGroupChat || !textareaRef.current) {
      if (!isGroupChat) console.log("[mention] isGroupChat is false, skipping");
      if (!textareaRef.current) console.log("[mention] textareaRef is null, skipping");
      setMentionState(null);
      return;
    }
    const cursorPos = textareaRef.current.selectionStart;
    const beforeCursor = input.slice(0, cursorPos);
    const atIndex = beforeCursor.lastIndexOf("@");
    console.log("[mention]", { cursorPos, beforeCursor, atIndex, input, contactsCount: contacts?.length });
    if (atIndex === -1) { setMentionState(null); return; }
    if (atIndex > 0 && beforeCursor[atIndex - 1] !== " " && beforeCursor[atIndex - 1] !== "\n") {
      console.log("[mention] @ not preceded by space/start");
      setMentionState(null); return;
    }
    const query = beforeCursor.slice(atIndex + 1);
    if (query.includes(" ")) { setMentionState(null); return; }
    console.log("[mention] setting mentionState", { query });
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
    setStreamError(null);
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

  // ─── Message action handlers ──────────────────────────────────
  async function handleRegenerate(messageId: string) {
    if (!conversationId) return;
    try {
      setStreamError(null);
      await api.post(
        `/api/conversations/${conversationId}/messages/${messageId}/regenerate`,
      );
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setStreamError(apiErr.message || "Regeneration failed");
    }
  }

  async function handlePin(messageId: string) {
    if (!conversationId) return;
    try {
      await api.post(
        `/api/conversations/${conversationId}/messages/${messageId}/pin`,
      );
    } catch {
      // silent
    }
  }

  // ─── Message edit / delete handlers ─────────────────────────────
  function startEditing(msg: Message) {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
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
      <div
        className="flex h-full items-center justify-center"
        style={{ background: "var(--bg-app)" }}
      >
        <div className="text-center" style={{ animation: "msgIn 0.35s ease forwards" }}>
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              backgroundColor: "var(--accent-light)",
              border: "1px solid var(--border-light)",
            }}
          >
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="var(--accent)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {t("chat").emptySelect}
          </p>
        </div>
      </div>
    );
  }

  // ─── Conversation agents (for header avatars) ──────────────────
  const convAgentIds = activeConversation?.contactIds ?? [];
  const convAgents = (contacts || []).filter((c) => convAgentIds.includes(c.id));

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--bg-app)" }}
    >
      {/* Header — Design Doc Section 4.1 */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{
          padding: "18px 24px",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <div className="flex items-center gap-3">
          {/* Stacked agent avatars */}
          <div className="flex" style={{ marginRight: "7px" }}>
            {(convAgents.length > 0 ? convAgents.slice(0, 3) : [{ id: "default", name: activeConversation?.title ?? "?" }]).map((agent, i) => (
              <div
                key={agent.id ?? i}
                className="flex items-center justify-center text-white font-medium"
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  marginRight: "-7px",
                  border: "2px solid var(--bg-app)",
                  background: (contacts || []).find((c) => c.id === agent.id) ? getAgentColor(agent.id) : "var(--accent)",
                  fontSize: "10px",
                  zIndex: 3 - i,
                }}
              >
                {(agent.name ?? activeConversation?.title ?? "")[0]?.toUpperCase()}
              </div>
            ))}
          </div>
          <div>
            <h3
              className="font-semibold"
              style={{
                fontSize: "14px",
                letterSpacing: "-0.2px",
                color: "var(--text-primary)",
              }}
            >
              {activeConversation?.title || t("common").loading}
            </h3>
            <div className="text-xs" style={{ color: "var(--text-tertiary)", marginTop: "1px" }}>
              {convAgents.length > 0
                ? convAgents.map((a) => a.name).join(" · ")
                : "直接对话"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1 text-xs transition-colors rounded"
            style={{
              padding: "2px 10px",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-active)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
          >
            &#9644; 预览
          </button>
          <button
            className="flex items-center justify-center text-sm transition-colors rounded"
            style={{
              width: "30px",
              height: "30px",
              color: "var(--text-tertiary)",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-tertiary)"; }}
          >
            •••
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto" style={{ padding: "24px 24px 16px" }}>
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {t("chat").loadingMessages}
            </span>
          </div>
        ) : messages.length === 0 && allStreamingMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {t("chat").emptyMessages}
            </span>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: "12px" }}>
            {messages.map((msg, idx) => {
              const senderType = msg.senderType?.toLowerCase?.() ?? "";
              const variant =
                senderType === "user" ? "user" :
                senderType === "system" ? "system" : "contact";

              const isLastUserMsg = idx === lastUserMsgIdx;
              const isEditing = editingMessageId === msg.id;

              return (
                <div
                  key={msg.id}
                  className="flex gap-2.5"
                  style={{
                    maxWidth: "88%",
                    alignSelf: variant === "user" ? "flex-end" : variant === "system" ? "center" : "flex-start",
                    flexDirection: variant === "user" ? "row-reverse" : "row",
                    opacity: 0,
                    animation: `msgIn 0.35s ease forwards`,
                    animationDelay: `${Math.min(idx * 0.08, 0.48)}s`,
                  }}
                  onMouseEnter={() => setHoveredMsgId(msg.id)}
                  onMouseLeave={() => setHoveredMsgId(null)}
                >
                  {/* Agent avatar (left side for agent messages) */}
                  {variant === "contact" && (
                    <div
                      className="flex-shrink-0 flex items-center justify-center text-white font-medium"
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: getAgentColor(msg.senderId),
                        fontSize: "10px",
                        marginTop: "4px",
                      }}
                    >
                      {(contacts?.find((c) => c.id === msg.senderId)?.name ?? msg.senderId ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}

                  {/* User avatar — must come before bubble for row-reverse to put it on the right */}
                  {variant === "user" && (
                    <div
                      className="flex-shrink-0 flex items-center justify-center text-white font-medium"
                      style={{
                        width: "28px",
                        height: "28px",
                        borderRadius: "50%",
                        background: "var(--text-secondary)",
                        fontSize: "10px",
                        marginTop: "4px",
                      }}
                    >
                      {(user?.username ?? "U")[0]?.toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0" style={{ position: "relative" }}>
                    {/* Sender name tag */}
                    {variant === "contact" && (
                      <div
                        className="flex items-center gap-1 mb-1"
                        style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 500 }}
                      >
                        {contacts?.find((c) => c.id === msg.senderId)?.name ?? msg.senderId}
                      </div>
                    )}

                    {/* Hover actions */}
                    {variant !== "system" && hoveredMsgId === msg.id && !isEditing && (
                      <div
                        className="hover-actions"
                        style={variant === "user" ? { right: "auto", left: "2px" } : {}}
                      >
                        {variant === "contact" && (
                          <>
                            <button title="Fork" onClick={() => handlePin(msg.id)}>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2" />
                              </svg>
                            </button>
                            <button title="重新生成" onClick={() => handleRegenerate(msg.id)}>
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          </>
                        )}
                        <button title="复制" onClick={() => { navigator.clipboard.writeText(msg.content); }}>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        {variant === "user" && (
                          <button title={t("common").edit ?? "Edit"} onClick={() => startEditing(msg)}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      style={{
                        padding: "10px 15px",
                        fontSize: "13px",
                        lineHeight: 1.6,
                        letterSpacing: "-0.01em",
                        overflowWrap: "anywhere",
                        wordBreak: "break-all",
                        ...(variant === "user"
                          ? {
                              background: "var(--bg-user)",
                              color: "#f0efeb",
                              borderRadius: "16px 4px 16px 16px",
                            }
                          : variant === "system"
                          ? {
                              background: "var(--accent-light)",
                              color: "var(--text-secondary)",
                              borderRadius: "var(--radius-md)",
                              textAlign: "center" as const,
                              maxWidth: "80%",
                              margin: "0 auto",
                            }
                          : {
                              background: "var(--bg-msg-agent)",
                              color: "var(--text-primary)",
                              borderRadius: "4px 16px 16px 16px",
                              border: "1px solid var(--border-light)",
                            }),
                      }}
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            ref={editTextareaRef}
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full resize-none rounded border bg-transparent px-2 py-1 text-sm outline-none"
                            style={{ borderColor: "var(--accent)", color: "var(--text-primary)" }}
                            rows={3}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={handleCancelEdit}
                              className="rounded px-2 py-1 text-xs"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {t("common").cancel}
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              disabled={!editContent.trim()}
                              className="rounded px-2 py-1 text-xs font-bold disabled:opacity-50"
                              style={{
                                color: "#fff",
                                background: "var(--accent)",
                              }}
                            >
                              {t("common").save}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <MessageContent message={msg} onShowArtifact={handleShowArtifact} />
                      )}
                    </div>

                    {/* Side buttons for reply/pin/delete */}
                    {variant !== "system" && hoveredMsgId === msg.id && !isEditing && (
                      <div
                        className="flex gap-1 mt-1"
                        style={{
                          justifyContent: variant === "user" ? "flex-end" : "flex-start",
                        }}
                      >
                        <button
                          onClick={() => setReplyTargetId(msg.id)}
                          className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                          style={{ color: "var(--text-tertiary)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-light)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.background = "transparent"; }}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Reply
                        </button>
                        {isLastUserMsg && (
                          <button
                            onClick={() => setShowDeleteConfirm(msg.id)}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                            style={{ color: "var(--text-tertiary)" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "rgba(201,58,58,0.08)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.background = "transparent"; }}
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </div>
                    )}

                    {/* Delete confirmation */}
                    {showDeleteConfirm === msg.id && (
                      <div className="mt-1 flex items-center gap-2" style={{ justifyContent: variant === "user" ? "flex-end" : "flex-start" }}>
                        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {t("common").confirm}?
                        </span>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="rounded px-2 py-0.5 text-xs"
                          style={{ color: "#fff", background: "var(--red)" }}
                        >
                          {t("common").delete}
                        </button>
                        <button
                          onClick={() => setShowDeleteConfirm(null)}
                          className="rounded px-2 py-0.5 text-xs"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {t("common").cancel}
                        </button>
                      </div>
                    )}
                  </div>

                </div>
              );
            })}

            {/* Streaming messages (supporting multiple agents) */}
            {allStreamingMessages.map((sm) => (
              <div
                key={sm.id}
                className="flex gap-2.5"
                style={{
                  maxWidth: "88%",
                  alignSelf: "flex-start",
                  opacity: 0,
                  animation: "msgIn 0.35s ease forwards",
                }}
              >
                <div
                  className="flex-shrink-0 flex items-center justify-center text-white font-medium"
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: getAgentColor(sm.senderId),
                    fontSize: "10px",
                    marginTop: "4px",
                  }}
                >
                  {(contacts?.find((c) => c.id === sm.senderId)?.name ?? sm.senderId ?? "?")[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div
                    className="flex items-center gap-1 mb-1"
                    style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 500 }}
                  >
                    {contacts?.find((c) => c.id === sm.senderId)?.name ?? sm.senderId}
                  </div>
                  <div
                    style={{
                      padding: "10px 15px",
                      fontSize: "13px",
                      lineHeight: 1.6,
                      background: "var(--bg-msg-agent)",
                      color: "var(--text-primary)",
                      borderRadius: "4px 16px 16px 16px",
                      border: "1px solid var(--border-light)",
                      wordBreak: "break-all",
                      overflowWrap: "anywhere",
                    }}
                  >
                    <span>
                      {sm.content}
                      <span className="streaming-cursor" />
                    </span>
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error banner */}
      {streamError && (
        <div
          className="mx-4 mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
          style={{
            animation: "msgIn 0.35s ease forwards",
            background: "rgba(201,58,58,0.08)",
            border: "1px solid rgba(201,58,58,0.2)",
            color: "var(--red)",
          }}
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-xs">{streamError}</span>
        </div>
      )}

      {/* Typing Indicator — show for all actively streaming agents */}
      {allStreamingMessages.length > 0 && (
        <TypingIndicator
          agents={allStreamingMessages.map((sm) => ({
            name: contacts?.find((c) => c.id === sm.senderId)?.name ?? sm.senderId ?? "Agent",
            color: getAgentColor(sm.senderId),
          }))}
        />
      )}

      {/* Input area — Design Doc Section 4.7 */}
      <div
        className="flex-shrink-0"
        style={{
          padding: "14px 24px 18px",
          borderTop: "1px solid var(--border-light)",
        }}
      >
        {/* Reply quote bar */}
        {replyTargetMessage && (
          <div
            className="flex items-center gap-2 px-3 py-2 mb-2"
            style={{
              borderLeft: "3px solid var(--accent)",
              background: "var(--accent-light)",
              borderRadius: "0 8px 8px 0",
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                回复 {replyTargetMessage.senderId}
              </div>
              <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>
                {replyTargetMessage.content.slice(0, 120)}
              </div>
            </div>
            <button
              onClick={() => setReplyTargetId(null)}
              className="flex-shrink-0 rounded p-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Attachment error */}
        {attachmentError && (
          <div
            className="mb-2 px-3 py-2 rounded-lg flex items-center gap-2"
            style={{
              animation: "msgIn 0.35s ease forwards",
              background: "rgba(201,58,58,0.08)",
              border: "1px solid rgba(201,58,58,0.2)",
              color: "var(--red)",
            }}
          >
            <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span className="text-xs">{attachmentError}</span>
          </div>
        )}

        {/* Input box */}
        <div
          className="flex items-end gap-2"
          style={{
            background: "var(--bg-sidebar)",
            border: "1.5px solid var(--border)",
            borderRadius: "var(--radius-lg)",
            padding: "9px 14px",
            transition: "all 0.2s ease",
            position: "relative",
          }}
          onFocus={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--text-primary)";
            el.style.background = "var(--bg-app)";
            el.style.boxShadow = "0 0 0 3px rgba(26,26,46,0.04)";
          }}
          onBlur={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = "var(--border)";
            el.style.background = "var(--bg-sidebar)";
            el.style.boxShadow = "none";
          }}
        >
          {mentionState && (
            <MentionPopup
              isOpen={true}
              agents={(contacts || [])
                .filter((a) => a.name.toLowerCase().includes(mentionState.query))
                .slice(0, 5)
                .map((a) => ({ id: a.id, name: a.name }))}
              selectedIndex={mentionSelectedIndex}
              onSelect={(agentId) => {
                const agent = contacts?.find((a) => a.id === agentId);
                if (agent) handleMentionSelect(agent.name);
              }}
            />
          )}

          {/* Attachment button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 flex items-center justify-center border-none cursor-pointer"
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "var(--radius-sm)",
              background: "none",
              color: "var(--text-tertiary)",
              fontSize: "14px",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.background = "var(--accent-light)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-tertiary)"; e.currentTarget.style.background = "none"; }}
            title="上传文件 (最大 5MB)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,.txt,.md,.json,.csv"
            className="hidden"
            onChange={handleFileSelect}
          />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 resize-none bg-transparent border-none outline-none"
            style={{
              color: "var(--text-primary)",
              fontSize: "13px",
              padding: "4px 0",
              fontFamily: "var(--font-sans)",
            }}
            rows={1}
            placeholder={isGroupChat ? "@ 提及 Agent..." : t("chat").inputPlaceholder}
            disabled={sending}
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 flex items-center justify-center text-white border-none cursor-pointer"
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "var(--radius-sm)",
              background: "var(--text-primary)",
              fontSize: "13px",
              opacity: !input.trim() || sending ? 0.4 : 1,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { if (!(!input.trim() || sending)) { e.currentTarget.style.opacity = "0.85"; e.currentTarget.style.transform = "scale(1.05)"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = (!input.trim() || sending) ? "0.4" : "1"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            →
          </button>
        </div>

      </div>

      {previewArtifactId && (
        <ArtifactPreviewModal
          artifactId={previewArtifactId}
          onClose={() => setPreviewArtifactId(null)}
        />
      )}
    </div>
  );
}
