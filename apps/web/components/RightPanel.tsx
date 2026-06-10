"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useChat } from "@/lib/chat-context";
import { api } from "@/lib/api-client";
import { DEMO_FILE_CONTENT } from "@/lib/demo-data";
import GroupSection from "./GroupSection";
import FileExplorer from "./FileExplorer";
import FileEditor from "./FileEditor";

interface RightPanelProps {
  content?: { type: string; id: string; content?: string; title?: string } | null;
  onClose?: () => void;
  conversationId?: string | null;
}

type TabKey = "preview" | "branch" | "versions";

const PANEL_TABS: { key: TabKey; labelKey: string }[] = [
  { key: "preview", labelKey: "预览" },
  { key: "branch", labelKey: "分支" },
  { key: "versions", labelKey: "版本" },
];

// ─── Agent color palette ────────────────────────────────────────────────
const AGENT_PALETTE = [
  "#1a1a2e", "#b8860b", "#2b8a6b", "#7c3aed", "#c93a3a",
  "#2563eb", "#c2410c", "#059669", "#6d28d9", "#be185d",
];

function getAgentColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length]!;
}

// ─── Component ─────────────────────────────────────────────────────────

interface ArtifactDetail {
  id: string;
  content: string | null;
  previewUrl: string | null;
  type: string;
  status?: string;
}

export default function RightPanel({ content, onClose: _onClose, conversationId }: RightPanelProps) {
  const { conversations, contacts, fetchConversations, demoMode, demoDiffs, removeDemoDiff } = useChat();
  const activeConversation = conversations.find((c) => c.id === conversationId);
  const isGroupChat = activeConversation?.type === "group";
  const convContactIds = activeConversation?.contactIds ?? [];
  const convMembers = (contacts || []).filter((c) => convContactIds.includes(c.id));
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>("preview");
  const [artifactData, setArtifactData] = useState<ArtifactDetail | null>(null);
  const [artifactLoading, setArtifactLoading] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diffsExpanded, setDiffsExpanded] = useState(true);
  const [viewingDiffContent, setViewingDiffContent] = useState<{ path: string; content: string; type: string } | null>(null);

  // ─── Pinned messages state ────────────────────────────────────────────
  interface PinnedMessage {
    id: string;
    content: string;
    senderId: string;
    createdAt: string;
  }
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const fetchPinnedRef = useRef(0);

  // Fetch pinned messages helper
  const fetchPinned = useCallback(async (convId: string) => {
    const tick = ++fetchPinnedRef.current;
    try {
      const data = await api.get<PinnedMessage[]>(
        `/api/conversations/${convId}/messages/pinned/list`,
      );
      if (tick === fetchPinnedRef.current) {
        setPinnedMessages(Array.isArray(data) ? data : []);
      }
    } catch {
      if (tick === fetchPinnedRef.current) setPinnedMessages([]);
    }
  }, []);

  // Fetch pinned messages on conversation change + auto-poll every 5s + immediate on pin event
  useEffect(() => {
    if (!conversationId) { setPinnedMessages([]); return; }
    fetchPinned(conversationId);
    const interval = setInterval(() => fetchPinned(conversationId!), 5000);

    // Immediate refresh when a message is pinned/unpinned from ChatPanel
    function onPinnedChanged(e: Event) {
      const evt = e as CustomEvent<{ conversationId: string }>;
      if (evt.detail?.conversationId === conversationId) {
        fetchPinned(conversationId);
      }
    }
    window.addEventListener("pinned-messages-changed", onPinnedChanged);

    return () => {
      clearInterval(interval);
      window.removeEventListener("pinned-messages-changed", onPinnedChanged);
    };
  }, [conversationId, fetchPinned]);

  async function handleUnpinMessage(messageId: string) {
    if (!conversationId) return;
    try {
      await api.post(
        `/api/conversations/${conversationId}/messages/${messageId}/pin`,
      );
      setPinnedMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      // silently fail
    }
  }

  async function handleRemoveMember(memberId: string) {
    if (!conversationId) return;
    setMemberError(null);
    try {
      await api.patch(`/api/conversations/${conversationId}/update`, {
        removeMembers: [memberId],
      });
      await fetchConversations();
    } catch {
      setMemberError("移除成员失败，请重试");
    }
  }

  async function handleAddMember(agentId: string) {
    if (!conversationId) return;
    setMemberError(null);
    try {
      await api.patch(`/api/conversations/${conversationId}/update`, {
        addMembers: [agentId],
      });
      await fetchConversations();
      setShowAddMember(false);
    } catch {
      setMemberError("添加成员失败，请重试");
    }
  }

  const availableForAdd = (contacts || []).filter(
    (c) => !convContactIds.includes(c.id),
  );

  // Fetch artifact detail when content changes to an artifact
  useEffect(() => {
    if (content?.type === "artifact") {
      setArtifactLoading(true);
      api
        .get<ArtifactDetail>(`/api/artifacts/${content.id}/detail`)
        .then((data) => {
          setArtifactData(data);
          setArtifactLoading(false);
          setActiveTab("preview");
        })
        .catch(() => {
          setArtifactData(null);
          setArtifactLoading(false);
        });
    } else if (content?.type === "preview" && content.content) {
      // Inline preview content from chat panel (e.g., web_preview expand)
      setArtifactData({
        id: "preview",
        content: content.content,
        previewUrl: null,
        type: "html",
        status: "ready",
      });
      setArtifactLoading(false);
      setActiveTab("preview");
    } else {
      setArtifactData(null);
    }
  }, [content]);

  // Reset selected file when conversation changes
  useEffect(() => {
    setSelectedFile(null);
  }, [conversationId]);

  // Demo mode: when a file is selected in the tree, show its content in preview
  useEffect(() => {
    if (!demoMode || !selectedFile) return;
    const content = DEMO_FILE_CONTENT[selectedFile];
    if (content) {
      const isHtml = selectedFile.endsWith(".html");
      setArtifactData({
        id: "file-" + selectedFile,
        content,
        previewUrl: null,
        type: isHtml ? "html" : "code",
        status: "ready",
      });
      setActiveTab("preview");
    }
  }, [selectedFile, demoMode]);

  return (
    <div
      className="flex h-full flex-col"
      style={{
        background: "var(--bg-sidebar)",
      }}
    >
      {/* Header with tabs — Design Doc Section 6.1 */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--border-light)",
        }}
      >
        <h4
          className="flex items-center gap-1.5 font-semibold"
          style={{
            color: "var(--text-primary)",
            fontSize: "12px",
            letterSpacing: "-0.2px",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: "var(--green)",
            }}
          />
          {t("rightPanel").collaborate}
        </h4>
        <div className="flex gap-0.5">
          {PANEL_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="transition-colors cursor-pointer"
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  border: "none",
                  background: isActive ? "var(--accent-light)" : "none",
                  color: isActive ? "var(--accent)" : "var(--text-tertiary)",
                  fontSize: "10px",
                  fontFamily: "var(--font-sans)",
                }}
              >
                {tab.labelKey}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pinned messages section — always visible above tabs */}
      {pinnedMessages.length > 0 && (
        <div
          className="flex flex-col flex-shrink-0"
          style={{
            borderBottom: "1px solid var(--border-light)",
          }}
        >
          <div
            className="flex items-center gap-1.5 px-4 py-2"
            style={{
              fontSize: "10px",
              color: "var(--text-tertiary)",
              fontWeight: 500,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)">
              <path d="M16 4v12l4 4V4a2 2 0 00-2-2H6a2 2 0 00-2 2v16l4-4V4h8z" />
            </svg>
            固定消息
            <span style={{ color: "var(--accent)", fontSize: "10px" }}>{pinnedMessages.length}</span>
          </div>
          <div className="flex flex-col px-3 pb-2 gap-1">
            {pinnedMessages.slice(0, 5).map((pm) => (
              <div
                key={pm.id}
                className="flex items-start gap-2 px-2.5 py-1.5 rounded group"
                style={{
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  fontSize: "11px",
                }}
              >
                <span className="flex-1 leading-relaxed line-clamp-1" style={{ color: "var(--text-secondary)", wordBreak: "break-all" }}>
                  {pm.content.slice(0, 80)}{pm.content.length > 80 ? "..." : ""}
                </span>
                <button
                  onClick={() => handleUnpinMessage(pm.id)}
                  className="flex-shrink-0 flex items-center justify-center rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ color: "var(--text-tertiary)", background: "none", border: "none" }}
                  title="取消固定"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {pinnedMessages.length > 5 && (
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", textAlign: "center", padding: "2px 0" }}>
                +{pinnedMessages.length - 5} 条更多...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div
        className="flex-1 overflow-y-auto flex flex-col"
        style={{ padding: "18px", gap: "14px" }}
      >
        {/* Group members section (group chats only) */}
        {isGroupChat && convMembers.length > 0 && (
          <GroupSection
            members={convMembers.map((m) => ({
              id: m.id,
              name: m.name,
              avatar: (m.name ?? "?")[0]?.toUpperCase() ?? "?",
              color: getAgentColor(m.id),
              role: m.provider,
            }))}
            onRemoveMember={handleRemoveMember}
            onAddMember={() => setShowAddMember(true)}
          />
        )}

        {memberError && (
          <div
            className="text-xs px-3 py-1.5 rounded"
            style={{
              color: "var(--red)",
              background: "var(--red-bg, rgba(201,58,58,0.08))",
            }}
          >
            {memberError}
          </div>
        )}

        {/* Add member overlay */}
        {showAddMember && (
          <div
            className="absolute inset-0 z-50 flex flex-col rounded-lg"
            style={{
              background: "var(--bg-app)",
              border: "1px solid var(--border)",
              margin: "8px",
            }}
          >
            <div
              className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: "1px solid var(--border-light)" }}
            >
              <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                邀请 Agent
              </span>
              <button
                onClick={() => setShowAddMember(false)}
                className="border-none cursor-pointer text-xs"
                style={{ color: "var(--text-tertiary)", background: "none" }}
              >
                取消
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {availableForAdd.length === 0 ? (
                <div className="text-xs py-4 text-center" style={{ color: "var(--text-tertiary)" }}>
                  没有可添加的 Agent
                </div>
              ) : (
                availableForAdd.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleAddMember(agent.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors cursor-pointer"
                    style={{ color: "var(--text-primary)", background: "none", border: "none" }}
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
                    <span className="flex-1 text-left">{agent.name}</span>
                    <span className="text-xs" style={{ color: "var(--accent)" }}>+ 邀请</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Preview Tab */}
        {activeTab === "preview" && (
          <>
            {artifactData ? (
              <div
                className="flex flex-col overflow-hidden"
                style={{ minHeight: "200px", borderRadius: "var(--radius-md)" }}
              >
                {/* File path header for demo file previews */}
                {artifactData.id.startsWith("file-") && (
                  <div
                    className="flex items-center justify-between px-3 py-1.5 text-[10px] font-mono"
                    style={{
                      background: "var(--bg-sidebar)",
                      borderBottom: "1px solid var(--border-light)",
                      color: "var(--text-secondary)",
                      borderRadius: "var(--radius-md) var(--radius-md) 0 0",
                    }}
                  >
                    <span>{artifactData.id.replace("file-", "")}</span>
                    <button
                      onClick={() => setArtifactData(null)}
                      className="border-none cursor-pointer text-[10px]"
                      style={{ color: "var(--text-tertiary)", background: "none" }}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div
                  className="flex-1 overflow-hidden rounded-lg"
                  style={{
                    border: "1px solid var(--border-light)",
                    borderTop: artifactData.id.startsWith("file-") ? "none" : undefined,
                    borderRadius: artifactData.id.startsWith("file-") ? "0 0 var(--radius-md) var(--radius-md)" : undefined,
                  }}
                >
                  {artifactData.previewUrl ? (
                    <iframe
                      className="h-full w-full border-0"
                      src={artifactData.previewUrl}
                      title="Artifact Preview"
                      sandbox="allow-scripts"
                      style={{
                        backgroundColor: "#fff",
                        minHeight: "300px",
                      }}
                    />
                  ) : artifactData.type === "html" ? (
                    <iframe
                      className="h-full w-full border-0"
                      srcDoc={artifactData.content ?? ""}
                      title="Artifact Preview"
                      sandbox="allow-scripts"
                      style={{
                        backgroundColor: "#fff",
                        minHeight: "300px",
                      }}
                    />
                  ) : (
                    <pre
                      className="whitespace-pre-wrap font-mono text-xs leading-relaxed"
                      style={{
                        color: "var(--text-primary)",
                        padding: "12px",
                        maxHeight: "400px",
                        overflow: "auto",
                      }}
                    >
                      {artifactData.content ?? "No content"}
                    </pre>
                  )}
                </div>
              </div>
            ) : artifactLoading ? (
              <div
                className="flex items-center justify-center"
                style={{ padding: "40px 0" }}
              >
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Loading...
                </span>
              </div>
            ) : (
              <div
                className="flex items-center justify-center"
                style={{
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                  borderRadius: "var(--radius-md)",
                  height: "170px",
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                    暂无预览内容
                  </div>
                  <div style={{ color: "var(--text-tertiary)", fontSize: "10px", marginTop: "4px", opacity: 0.7 }}>
                    发送代码后在此处实时预览
                  </div>
                </div>
              </div>
            )}

            {/* ─── Project Files Section ─────────────────────────────── */}
            <div>
              <div
                className="font-medium uppercase"
                style={{
                  color: "var(--text-tertiary)",
                  fontSize: "10px",
                  letterSpacing: "0.3px",
                  marginBottom: "6px",
                }}
              >
                项目文件
              </div>

              {selectedFile && conversationId && !demoMode ? (
                <div className="mb-3">
                  <FileEditor
                    conversationId={conversationId}
                    filePath={selectedFile}
                    onClose={() => setSelectedFile(null)}
                  />
                </div>
              ) : null}

              <FileExplorer
                conversationId={conversationId ?? null}
                onFileSelect={setSelectedFile}
              />
            </div>
          </>
        )}

        {/* Branch Tab */}
        {activeTab === "branch" && (
          <div
            style={{
              background: "var(--bg-app)",
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "12px",
            }}
          >
            <div
              className="font-semibold"
              style={{
                fontSize: "9px",
                color: "var(--text-tertiary)",
                marginBottom: "6px",
              }}
            >
              对话演进
            </div>
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <svg width="200" height="40" viewBox="0 0 200 40">
                <line x1="10" y1="20" x2="190" y2="20" stroke="var(--border)" strokeWidth="2" />
                <circle cx="180" cy="20" r="5" fill="var(--accent)" />
              </svg>
            </div>
            <div className="flex gap-2.5" style={{ marginTop: "6px" }}>
              <span className="flex items-center gap-1" style={{ fontSize: "9px", color: "var(--text-tertiary)" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: "var(--accent)" }} />
                主分支
              </span>
            </div>
          </div>
        )}

        {/* Versions Tab — Design Doc Section 6.3 */}
        {activeTab === "versions" && (
          <div>
            <div
              className="font-semibold uppercase"
              style={{
                fontSize: "9px",
                color: "var(--text-tertiary)",
                letterSpacing: "0.3px",
                marginBottom: "8px",
              }}
            >
              版本历史
            </div>
            <div style={{ color: "var(--text-tertiary)", fontSize: "11px", padding: "16px 0", textAlign: "center" }}>
              暂无版本记录
            </div>
          </div>
        )}
      </div>
      {/* ─── Diff Timeline (demo mode) ────────────────────────── */}
      {demoMode && demoDiffs.length > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--border-light)",
            padding: "12px 18px",
            maxHeight: "50%",
            overflow: "auto",
          }}
        >
          {/* Collapsible header */}
          <div
            className="flex items-center gap-1.5 cursor-pointer select-none"
            onClick={() => setDiffsExpanded((v) => !v)}
            style={{ color: "var(--text-tertiary)", fontSize: "10px", letterSpacing: "0.3px", fontWeight: 500, marginBottom: diffsExpanded ? "6px" : "0" }}
          >
            <span style={{ fontSize: "8px", transition: "transform 0.2s", transform: diffsExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>
              ▶
            </span>
            变更记录
            <span style={{ color: "var(--accent)", fontSize: "9px", marginLeft: "2px" }}>{demoDiffs.length}</span>
          </div>

          {diffsExpanded && (
            <>
              {/* Content preview for clicked diff item */}
              {viewingDiffContent && (
                <div
                  className="rounded-lg overflow-hidden mb-2"
                  style={{
                    border: "1px solid var(--border-light)",
                    background: "var(--bg-app)",
                  }}
                >
                  <div
                    className="flex items-center justify-between px-2 py-1.5"
                    style={{ borderBottom: "1px solid var(--border-light)", fontSize: "10px", color: "var(--text-secondary)" }}
                  >
                    <span className="font-mono">{viewingDiffContent.path}</span>
                    <button
                      onClick={() => setViewingDiffContent(null)}
                      className="border-none cursor-pointer text-[10px]"
                      style={{ color: "var(--text-tertiary)", background: "none" }}
                    >
                      关闭
                    </button>
                  </div>
                  <div
                    className="overflow-x-auto font-mono text-[10px] leading-relaxed p-2.5"
                    style={{ color: "var(--text-primary)", maxHeight: "240px", overflowY: "auto", whiteSpace: "pre" }}
                  >
                    {viewingDiffContent.type === "modified"
                      ? viewingDiffContent.content.split("\n").map((line, li) => {
                          const trimmed = line;
                          if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) {
                            return <div key={li} style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>{trimmed}</div>;
                          }
                          if (trimmed.startsWith("-") && !trimmed.startsWith("---")) {
                            return <div key={li} style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>{trimmed}</div>;
                          }
                          if (trimmed.startsWith("@@")) {
                            return <div key={li} style={{ color: "var(--accent)", opacity: 0.7 }}>{trimmed}</div>;
                          }
                          return <div key={li}>{trimmed}</div>;
                        })
                      : viewingDiffContent.content.split("\n").map((line, li) => (
                          <div key={li} style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>+ {line}</div>
                        ))
                    }
                  </div>
                </div>
              )}

              {/* Diff list */}
              <div
                className="flex flex-col rounded-lg overflow-hidden"
                style={{ border: "1px solid var(--border-light)", fontSize: "11px" }}
              >
                {demoDiffs.map((diff, i) => (
                  <div
                    key={`${diff.path}-${i}`}
                    className="flex items-center gap-1.5 px-3 py-2 cursor-pointer transition-colors"
                    style={{
                      borderBottom: i < demoDiffs.length - 1 ? "1px solid var(--border-light)" : "none",
                      color: "var(--text-secondary)",
                    }}
                    onClick={() => {
                      if (diff.content) setViewingDiffContent({ path: diff.path, content: diff.content, type: diff.type });
                      else if (diff.diff) setViewingDiffContent({ path: diff.path, content: diff.diff, type: diff.type });
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span
                      className="flex-shrink-0 font-mono text-[10px]"
                      style={{ color: diff.type === "created" ? "#22c55e" : "var(--accent)" }}
                    >
                      {diff.type === "created" ? "+" : "~"}
                    </span>
                    <span className="truncate font-mono" style={{ fontSize: "10px" }}>
                      {diff.path}
                    </span>
                    <span
                      className="flex-shrink-0 text-[9px]"
                      style={{
                        color: diff.type === "created" ? "#22c55e" : "var(--accent)",
                        background: diff.type === "created" ? "rgba(34,197,94,0.1)" : "var(--accent-light)",
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {diff.type === "created" ? "新增" : "修改"}
                    </span>
                    {/* Per-file confirm / cancel */}
                    <div className="flex gap-0.5 flex-shrink-0 ml-auto">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (viewingDiffContent?.path === diff.path) setViewingDiffContent(null);
                          removeDemoDiff(diff.path);
                        }}
                        className="flex items-center justify-center w-5 h-5 rounded border-none cursor-pointer transition-all"
                        style={{ background: "var(--accent)", color: "#fff", fontSize: "9px", lineHeight: 1 }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                        title="确认"
                      >
                        ✓
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (viewingDiffContent?.path === diff.path) setViewingDiffContent(null);
                          removeDemoDiff(diff.path);
                        }}
                        className="flex items-center justify-center w-5 h-5 rounded border-none cursor-pointer transition-all"
                        style={{ background: "var(--bg-hover)", color: "var(--text-tertiary)", fontSize: "9px", lineHeight: 1 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                        title="取消"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Global Confirm / Cancel buttons */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => {
                    setViewingDiffContent(null);
                    demoDiffs.forEach((d) => removeDemoDiff(d.path));
                  }}
                  className="flex-1 rounded-lg py-1.5 text-[10px] font-medium border-none cursor-pointer transition-all"
                  style={{
                    background: "var(--accent)",
                    color: "#fff",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                >
                  ✓ 确认全部
                </button>
                <button
                  onClick={() => {
                    setViewingDiffContent(null);
                    demoDiffs.forEach((d) => removeDemoDiff(d.path));
                  }}
                  className="flex-1 rounded-lg py-1.5 text-[10px] font-medium border-none cursor-pointer transition-all"
                  style={{
                    background: "var(--bg-hover)",
                    color: "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                >
                  取消全部
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
