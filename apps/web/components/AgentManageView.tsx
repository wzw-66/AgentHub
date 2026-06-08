"use client";

import { useState, useMemo } from "react";
import { api } from "@/lib/api-client";
import EditAgentModal from "./EditAgentModal";

interface AgentInfo {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
  displayName?: string | null;
  tags?: string[];
  systemPrompt?: string | null;
}

interface AgentManageViewProps {
  contacts: AgentInfo[];
  onRefresh: () => void;
  onBack: () => void;
}

const AGENT_PALETTE = [
  "#1a1a2e", "#b8860b", "#2b8a6b", "#7c3aed", "#c93a3a",
  "#2563eb", "#c2410c", "#059669", "#6d28d9", "#be185d",
];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return AGENT_PALETTE[Math.abs(hash) % AGENT_PALETTE.length]!;
}

function getProviderIcon(provider: string): string {
  switch (provider) {
    case "Claude": return "C";
    case "OpenCode": return "O";
    case "Custom": return "⚡";
    default: return "?";
  }
}

export default function AgentManageView({ contacts, onRefresh, onBack }: AgentManageViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredContacts = useMemo(
    () => contacts.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [contacts, searchQuery],
  );

  async function handleDelete(agentId: string) {
    try {
      await api.delete(`/api/contacts/${agentId}/delete`);
      setDeleteConfirmId(null);
      onRefresh();
    } catch {
      // silent
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex items-center gap-2 flex-shrink-0"
        style={{ padding: "0 14px 8px" }}
      >
        <span
          className="flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-colors flex-shrink-0"
          style={{ color: "var(--text-secondary)", fontSize: "14px" }}
          onClick={onBack}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          ←
        </span>
      </div>

      {/* Search */}
      <div
        className="flex items-center gap-1.5 text-xs transition-colors flex-shrink-0"
        style={{
          margin: "0 14px 12px",
          padding: "7px 12px",
          background: "var(--bg-app)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-md)",
          color: "var(--text-tertiary)",
        }}
      >
        <span style={{ fontSize: "11px" }}>&#128269;</span>
        <input
          placeholder="搜索我的 Agent..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: "var(--text-primary)", fontSize: "12px" }}
          autoFocus
        />
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "0 8px" }}>
        {filteredContacts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 text-center"
            style={{ color: "var(--text-tertiary)", fontSize: "11px" }}
          >
            <p style={{ marginBottom: "6px" }}>
              {searchQuery ? "没有匹配的 Agent" : "还没有创建任何 Agent"}
            </p>
            {!searchQuery && (
              <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                点击底部「创建新 Agent」按钮开始
              </span>
            )}
          </div>
        ) : (
          filteredContacts.map((agent) => {
            const isDeleteConfirm = deleteConfirmId === agent.id;
            const displayName = agent.displayName && agent.displayName !== agent.name
              ? agent.displayName
              : null;

            return (
              <div
                key={agent.id}
                className="rounded-lg mb-2 p-3 transition-colors"
                style={{
                  background: "var(--bg-app)",
                  border: "1px solid var(--border-light)",
                }}
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <span
                    className="flex items-center justify-center text-white font-medium rounded-full flex-shrink-0"
                    style={{
                      width: "36px",
                      height: "36px",
                      background: getAgentColor(agent.name),
                      fontSize: "12px",
                    }}
                  >
                    {agent.name[0]?.toUpperCase() ?? "?"}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="truncate font-medium"
                        style={{ color: "var(--text-primary)", fontSize: "12px" }}
                      >
                        {agent.name}
                      </span>
                      <span
                        className="flex items-center justify-center rounded px-1 flex-shrink-0"
                        style={{
                          fontSize: "8px",
                          height: "14px",
                          background: "var(--bg-hover)",
                          color: "var(--text-tertiary)",
                          fontWeight: 500,
                        }}
                      >
                        {getProviderIcon(agent.provider)}
                      </span>
                    </div>
                    {displayName && (
                      <div
                        className="truncate"
                        style={{ color: "var(--text-tertiary)", fontSize: "10px", marginTop: "1px" }}
                      >
                        {displayName}
                      </div>
                    )}
                    {agent.tags && agent.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1" style={{ marginTop: "4px" }}>
                        {agent.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: "8px",
                              padding: "1px 5px",
                              borderRadius: "4px",
                              background: "var(--bg-hover)",
                              color: "var(--text-tertiary)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {!isDeleteConfirm ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setEditingAgent(agent)}
                        className="flex items-center justify-center rounded transition-colors"
                        style={{
                          width: "24px",
                          height: "24px",
                          color: "var(--text-tertiary)",
                          fontSize: "11px",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        title="编辑"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(agent.id)}
                        className="flex items-center justify-center rounded transition-colors"
                        style={{
                          width: "24px",
                          height: "24px",
                          color: "var(--text-tertiary)",
                          fontSize: "11px",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                        title="删除"
                      >
                        🗑️
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>确认?</span>
                      <button
                        onClick={() => handleDelete(agent.id)}
                        className="rounded px-1.5 py-0.5 text-[10px] text-white"
                        style={{ background: "var(--red)" }}
                      >
                        删除
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="rounded px-1.5 py-0.5 text-[10px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        取消
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Agent Modal */}
      {editingAgent && (
        <EditAgentModal
          agent={{
            id: editingAgent.id,
            name: editingAgent.name,
            provider: editingAgent.provider,
            displayName: editingAgent.displayName ?? null,
            tags: editingAgent.tags,
            systemPrompt: editingAgent.systemPrompt ?? null,
          }}
          onClose={() => setEditingAgent(null)}
          onSaved={() => {
            setEditingAgent(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
