"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useChat } from "@/lib/chat-context";
import GroupSection from "./GroupSection";

interface RightPanelProps {
  content?: { type: string; id: string } | null;
  onClose?: () => void;
  conversationId?: string | null;
}

type TabKey = "preview" | "debate" | "branch" | "versions";

const PANEL_TABS: { key: TabKey; labelKey: string }[] = [
  { key: "preview", labelKey: "预览" },
  { key: "debate", labelKey: "辩论" },
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

export default function RightPanel({ onClose: _onClose, conversationId }: RightPanelProps) {
  const { conversations, contacts } = useChat();
  const activeConversation = conversations.find((c) => c.id === conversationId);
  const isGroupChat = activeConversation?.type === "group";
  const convContactIds = activeConversation?.contactIds ?? [];
  const convMembers = (contacts || []).filter((c) => convContactIds.includes(c.id));
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>("preview");

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
            onRemoveMember={() => {}}
            onAddMember={() => {}}
          />
        )}

        {/* Preview Tab */}
        {activeTab === "preview" && (
          <>
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
              <div style={{ color: "var(--text-tertiary)", fontSize: "11px", padding: "8px 0", textAlign: "center" }}>
                暂无项目文件
              </div>
            </div>
          </>
        )}

        {/* Debate Tab */}
        {activeTab === "debate" && (
          <div
            className="flex flex-col items-center justify-center"
            style={{
              padding: "40px 0",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "4px" }}>
              暂无辩论
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-tertiary)", opacity: 0.7 }}>
              多 Agent 辩论内容将在此处展示
            </div>
          </div>
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
