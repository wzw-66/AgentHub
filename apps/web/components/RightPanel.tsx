"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { useChat } from "@/lib/chat-context";
import { api } from "@/lib/api-client";
import GroupSection from "./GroupSection";
import FileExplorer from "./FileExplorer";
import FileEditor from "./FileEditor";

interface RightPanelProps {
  content?: { type: string; id: string } | null;
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
  const { conversations, contacts, fetchConversations } = useChat();
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
    } else {
      setArtifactData(null);
    }
  }, [content]);

  // Reset selected file when conversation changes
  useEffect(() => {
    setSelectedFile(null);
  }, [conversationId]);

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
                <div
                  className="flex-1 overflow-hidden rounded-lg"
                  style={{ border: "1px solid var(--border-light)" }}
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

              {selectedFile && conversationId ? (
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
    </div>
  );
}
