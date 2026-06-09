"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useChat } from "@/lib/chat-context";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import type { Message } from "@agenthub/shared";
import TypingIndicator from "./TypingIndicator";
import { MarkdownRenderer, MARKDOWN_COMPONENTS } from "./MarkdownRenderer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import MentionPopup from "./MentionPopup";
import DeployCard from "./DeployCard";
import HesitateBubble from "./HesitateBubble";
import DebateTable from "./DebateTable";
import SilentAlertCard from "./SilentAlertCard";
import DiffCard from "./DiffCard";
import ArtifactCardComponent from "./ArtifactCard";
import ArtifactPreviewModal from "./ArtifactPreviewModal";
import { parseArtifactMarkers } from "@/lib/artifact-marker-parser";
import type { ContentBlock } from "@/lib/artifact-marker-parser";
import { CodeBlock } from "@agenthub/ui";

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

// ─── Tool name → display label mapping ──────────────────────────────
const TOOL_LABELS: Record<string, string> = {
  // Canonical (used after AgentHarness alias normalization)
  write_file: "✏️ 写入文件",
  read_file: "📖 读取文件",
  execute_command: "💻 执行命令",
  list_dir: "📂 浏览目录",
  // Claude CLI raw names (fallback)
  Write: "✏️ 写入文件",
  Read: "📖 读取文件",
  Bash: "💻 执行命令",
  Glob: "🔍 搜索文件",
  Grep: "🔍 搜索内容",
  Edit: "✏️ 编辑文件",
  Think: "🤔 思考中",
};

// ─── Helpers ───────────────────────────────────────────────────────────

/** Map file extension → language identifier for syntax highlighting. */
function detectLanguage(title: string): string {
  const ext = title.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp",
    html: "html", css: "css", scss: "scss", json: "json",
    yaml: "yaml", yml: "yaml", md: "markdown", sql: "sql",
    sh: "bash", bash: "bash", xml: "xml", svg: "svg",
    vue: "vue", php: "php", swift: "swift", kt: "kotlin",
    toml: "toml", diff: "diff", patch: "diff",
  };
  return ext ? (map[ext] ?? "text") : "text";
}

/**
 * Render parsed content blocks with differentiated rendering per type.
 */
function renderArtifactBlocks(blocks: ContentBlock[]): React.ReactNode {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "text":
            return <MarkdownRenderer key={i} content={block.content} />;

          case "code":
            return (
              <div key={i} className="mb-2">
                {block.title && (
                  <div
                    className="text-[10px] font-mono px-2 py-1 rounded-t"
                    style={{
                      color: "var(--text-secondary)",
                      background: "var(--bg-sidebar)",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    {block.title}
                  </div>
                )}
                <CodeBlock
                  code={block.content}
                  language={detectLanguage(block.title)}
                />
              </div>
            );

          case "web_preview":
            return (
              <div
                key={i}
                className="rounded-lg overflow-hidden mb-2"
                style={{ border: "1px solid var(--border-light)" }}
              >
                {block.title && (
                  <div
                    className="text-[10px] font-mono px-2 py-1"
                    style={{
                      color: "var(--text-secondary)",
                      background: "var(--bg-sidebar)",
                      borderBottom: "1px solid var(--border-light)",
                    }}
                  >
                    {block.title} — 预览
                  </div>
                )}
                <iframe
                  className="w-full border-0"
                  srcDoc={block.content}
                  title={block.title}
                  sandbox="allow-scripts"
                  style={{ backgroundColor: "#fff", minHeight: "200px" }}
                />
              </div>
            );

          case "diff":
            return (
              <div key={i} className="mb-2">
                <DiffCard content={block.content} />
              </div>
            );

          case "document":
            return <MarkdownRenderer key={i} content={block.content} />;

          default:
            return null;
        }
      })}
    </>
  );
}

/** Check whether a string contains artifact markers. */
function hasArtifactMarkers(content: string): boolean {
  return /~~~artifact:/.test(content);
}

function MessageContent({
  message,
  onShowArtifact,
  streaming,
}: {
  message: Message;
  onShowArtifact?: (artifactId: string) => void;
  streaming?: boolean;
}) {
  // New path: content has artifact markers → parse and render by type
  if (hasArtifactMarkers(message.content)) {
    const blocks = parseArtifactMarkers(message.content);
    return renderArtifactBlocks(blocks);
  }

  // Backward compat: old "artifact" type without markers → use ArtifactCard
  if (message.type === "artifact") {
    const firstArtifact = (message as Message & { artifacts?: Array<{ id: string }> }).artifacts?.[0];
    return (
      <ArtifactCardComponent
        content={message.content}
        title={firstArtifact?.id ? `Artifact #${firstArtifact.id.slice(0, 8)}` : "Artifact"}
        onPreview={firstArtifact && onShowArtifact ? () => onShowArtifact(firstArtifact.id) : undefined}
      />
    );
  }

  // Streaming indicator for artifacts being built
  if (streaming && hasArtifactMarkers(message.content)) {
    return (
      <div>
        <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}>
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)", animation: "bounce 1s ease infinite" }} />
          正在构建产物...
        </span>
      </div>
    );
  }

  // Old path: no markers, render by message type
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

// ─── Interaction Text Input ────────────────────────────────────────────

function InteractionTextInput({
  onSend,
}: {
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onSend(text.trim());
        setText("");
      }
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入你的回答..."
        className="flex-1 rounded-lg px-3 py-1.5 text-xs outline-none border"
        style={{
          background: "var(--bg-app)",
          color: "var(--text-primary)",
          borderColor: "var(--border)",
        }}
      />
      <button
        onClick={() => {
          if (text.trim()) {
            onSend(text.trim());
            setText("");
          }
        }}
        disabled={!text.trim()}
        className="px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        发送
      </button>
    </div>
  );
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
  const { messages, conversations, isLoadingMessages, sendMessage, contacts, streamingMessages, streamError, setStreamError, setMessages, toolStatusMap, pendingInteraction, respondToInteraction, cancelInteraction } = useChat();
  const allStreamingMessages = [...streamingMessages.values()];
  const { user } = useAuth();
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [waitingForResponse, setWaitingForResponse] = useState(false);
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  // (showDeleteConfirm removed)

  // ─── Regenerating state — immediately hide old content, show transition ──
  const [regeneratingIds, setRegeneratingIds] = useState<Set<string>>(new Set());

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

  const lastAgentMsgIds = useMemo(() => {
    const ids = new Set<string>();
    if (isGroupChat) {
      const seen = new Set<string>();
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]!;
        if (m.senderType?.toLowerCase?.() === "contact" && !seen.has(m.senderId)) {
          seen.add(m.senderId);
          ids.add(m.id);
        }
      }
    } else {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]!.senderType?.toLowerCase?.() === "contact") {
          ids.add(messages[i]!.id);
          break;
        }
      }
    }
    return ids;
  }, [messages, isGroupChat]);

  // ─── Auto-scroll ────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, allStreamingMessages, scrollToBottom]);

  // ─── Clear waiting state when streaming starts or error occurs ──
  useEffect(() => {
    if (waitingForResponse && (allStreamingMessages.length > 0 || streamError)) {
      setWaitingForResponse(false);
    }
  }, [allStreamingMessages.length, streamError, waitingForResponse]);

  // ─── Clean up regenerating state when message content appears ──
  useEffect(() => {
    if (regeneratingIds.size === 0) return;
    const next = new Set(regeneratingIds);
    for (const id of regeneratingIds) {
      const msg = messages.find((m) => m.id === id);
      if (msg?.content) {
        next.delete(id);
      }
    }
    if (next.size !== regeneratingIds.size) {
      setRegeneratingIds(next);
    }
  }, [messages, regeneratingIds]);

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

  // ─── Auto-resize textarea ─────────────────────────────────────
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
    ta.style.overflowY = ta.scrollHeight > 200 ? "auto" : "hidden";
  }, [input]);

  // ─── Send ───────────────────────────────────────────────────────
  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || !conversationId || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setStreamError(null);
    try {
      await sendMessage(conversationId, trimmed, replyTargetId ?? undefined);
      setWaitingForResponse(true);
      setInput("");
      setReplyTargetId(null);
      textareaRef.current?.focus();
    } catch {
      // silent
    } finally {
      sendingRef.current = false;
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
      // Immediately hide old content and show transition animation
      setRegeneratingIds((prev) => new Set(prev).add(messageId));
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content: "" } : m)),
      );
      await api.post(
        `/api/conversations/${conversationId}/messages/${messageId}/regenerate`,
      );
    } catch (err: unknown) {
      setRegeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      const apiErr = err as { message?: string };
      setStreamError(apiErr.message || "Regeneration failed");
    }
  }

  // (handlePin removed - Fork button no longer exists)// ─── Message edit / delete handlers ─────────────────────────────
  function startEditing(msg: Message) {
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    setTimeout(() => editTextareaRef.current?.focus(), 0);
  }

  async function handleSaveEdit() {
    const trimmed = editContent.trim();
    if (!trimmed || !editingMessageId || !conversationId) return;
    try {
      const res = await api.patch<{
        message: Message;
        deletedMessageIds?: string[];
      }>(
        `/api/conversations/${conversationId}/messages/${editingMessageId}/update`,
        { content: trimmed },
      );
      // Update local state: set new content and remove stale AI responses
      setMessages((prev) => {
        let updated = prev.map((m) =>
          m.id === editingMessageId ? { ...m, content: res.message.content } : m,
        );
        // Remove deleted messages (stale AI responses after the edited message)
        if (res.deletedMessageIds?.length) {
          updated = updated.filter((m) => !res.deletedMessageIds!.includes(m.id));
        }
        return updated;
      });
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

  // (handleDelete removed - Delete button no longer exists)

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
          <div className="flex flex-col">
            {messages.map((msg, idx) => {
              const senderType = msg.senderType?.toLowerCase?.() ?? "";
              const variant =
                senderType === "user" ? "user" :
                senderType === "system" ? "system" : "contact";

              const isEditing = editingMessageId === msg.id;

              // Dynamic gap: group user↔agent as Q&A pair, separate agent→user between rounds
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const prevSenderType = prevMsg?.senderType?.toLowerCase?.() ?? "";
              const isFirst = idx === 0;
              const isBetweenRounds = prevSenderType === "agent" && senderType === "user";
              const msgMarginTop = isFirst ? "0px" : isBetweenRounds ? "24px" : "8px";

              return (
                <div
                  key={msg.id}
                  className="flex gap-2.5"
                  style={{
                    maxWidth: "88%",
                    marginTop: msgMarginTop,
                    alignSelf: variant === "user" ? "flex-end" : variant === "system" ? "center" : "flex-start",
                    flexDirection: variant === "user" ? "row-reverse" : "row",
                    opacity: 0,
                    animation: `msgIn 0.35s ease forwards`,
                    animationDelay: `${Math.min(idx * 0.08, 0.48)}s`,
                  }}
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

                  <div className="min-w-0">
                    {/* Sender name tag */}
                    {variant === "contact" && (
                      <div
                        className="flex items-center gap-1 mb-1"
                        style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 500 }}
                      >
                        {contacts?.find((c) => c.id === msg.senderId)?.name ?? msg.senderId}
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
                            className="w-full resize-none rounded px-2 py-1 text-sm outline-none focus-visible:outline-none"
                            style={{
                              border: "1px solid var(--accent)",
                              color: "#fff",
                              background: "#000",
                            }}
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
                      ) : regeneratingIds.has(msg.id) ? (
                        <div className="flex items-center gap-2 py-1" style={{ minHeight: "24px" }}>
                          <div className="flex items-center gap-1">
                            {[0, 1, 2].map((i) => (
                              <span key={i} className="typing-dot" />
                            ))}
                          </div>
                          <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>重新生成中...</span>
                        </div>
                      ) : (
                        <MessageContent message={msg} onShowArtifact={handleShowArtifact} />
                      )}
                    </div>

                    {/* Bottom actions — merged below bubble */}
                    {variant !== "system" && !isEditing && !regeneratingIds.has(msg.id) && (
                      <div
                        className="msg-actions mt-1"
                        style={{
                          justifyContent: variant === "user" ? "flex-start" : "flex-end",
                        }}
                      >
                        {/* Copy — all non-system messages */}
                        <button title="复制" onClick={() => { navigator.clipboard.writeText(msg.content); }}>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>

                        {/* Reply — all non-system messages */}
                        <button
                          title="Reply"
                          onClick={() => setReplyTargetId(msg.id)}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                        </button>

                        {/* Regenerate — agent messages only, last per agent */}
                        {variant === "contact" && lastAgentMsgIds.has(msg.id) && (
                          <button title="重新生成" onClick={() => handleRegenerate(msg.id)}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}

                        {/* Edit — user messages only, last user message */}
                        {variant === "user" && idx === lastUserMsgIdx && (
                          <button title={t("common").edit ?? "Edit"} onClick={() => startEditing(msg)}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              );
            })}

            {/* Streaming messages (supporting multiple agents) */}
            {allStreamingMessages.map((sm, smIdx) => {
              const toolStatus = toolStatusMap.get(sm.senderId);
              const streamMarginTop = smIdx === 0 ? (messages.length > 0 ? "8px" : "0px") : "8px";
              return (
                <div
                  key={sm.id}
                  className="flex gap-2.5"
                  style={{
                    maxWidth: "88%",
                    marginTop: streamMarginTop,
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
                  <div className="min-w-0" style={{ maxWidth: "100%" }}>
                    <div
                      className="flex items-center gap-1 mb-1"
                      style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 500 }}
                    >
                      {contacts?.find((c) => c.id === sm.senderId)?.name ?? sm.senderId}
                      {toolStatus && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded"
                          style={{
                            fontSize: "9px",
                            color: "var(--accent)",
                            background: "var(--accent-light)",
                            marginLeft: "6px",
                          }}
                        >
                          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{
                            background: "var(--accent)",
                            animation: "bounce 1s ease infinite",
                          }} />
                          {TOOL_LABELS[toolStatus.toolName] ?? toolStatus.toolName}
                        </span>
                      )}
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
                      {hasArtifactMarkers(sm.content) ? (
                        renderArtifactBlocks(parseArtifactMarkers(sm.content))
                      ) : (
                        <span className="markdown-render">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={MARKDOWN_COMPONENTS}
                          >
                            {sm.content || "..."}
                          </ReactMarkdown>
                          <span className="streaming-cursor" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Thinking indicator — shown between user message and first agent output */}
            {waitingForResponse && (
              <TypingIndicator
                messageStyle
                agents={
                  convAgents.length > 0
                    ? convAgents.map((a) => ({ name: a.name, color: getAgentColor(a.id) }))
                    : [{ name: "Agent", color: "var(--accent)" }]
                }
              />
            )}

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

      {/* Interactive card — Agent asks user a question */}
      {pendingInteraction && (
        <div
          className="mx-4 mb-2 rounded-lg overflow-hidden"
          style={{
            border: "1px solid var(--accent)",
            background: "var(--bg-sidebar)",
            animation: "msgIn 0.35s ease forwards",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{
              background: "var(--accent-light)",
              borderBottom: "1px solid var(--border-light)",
            }}
          >
            <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
              🤖 Agent 需要你确认
            </span>
            <button
              onClick={cancelInteraction}
              className="flex items-center justify-center rounded p-1 border-none cursor-pointer"
              style={{ color: "var(--text-tertiary)", background: "none" }}
              title="取消"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-3 py-3">
            <p className="text-sm mb-3" style={{ color: "var(--text-primary)", lineHeight: 1.5 }}>
              {pendingInteraction.prompt}
            </p>

            {/* Options as buttons */}
            {pendingInteraction.options && pendingInteraction.options.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {pendingInteraction.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => respondToInteraction(opt.label)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer transition-all"
                    style={{
                      background: "var(--accent-light)",
                      color: "var(--accent)",
                      border: "1px solid var(--accent)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent-light)"; e.currentTarget.style.color = "var(--accent)"; }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {/* Text input for custom responses */}
            <InteractionTextInput onSend={respondToInteraction} />
          </div>
        </div>
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
            className="flex-1 resize-none bg-transparent border-none outline-none focus-visible:outline-none"
            style={{
              color: "var(--text-primary)",
              fontSize: "13px",
              padding: "4px 0",
              fontFamily: "var(--font-sans)",
              maxHeight: "200px",
              overflowY: "hidden",
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
