"use client";

import { useState, useMemo } from "react";
import type { Conversation } from "@agenthub/shared";

interface AgentInfo {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
}

interface AddAgentViewProps {
  contacts: AgentInfo[];
  createConversation: (title: string, type: "single" | "group", contactIds: string[]) => Promise<Conversation>;
  onSelectConversation: (id: string) => void;
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

export default function AddAgentView({
  contacts,
  createConversation,
  onSelectConversation,
  onBack,
}: AddAgentViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isGroupMode, setIsGroupMode] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());

  const filteredContacts = useMemo(
    () => contacts.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [contacts, searchQuery],
  );

  async function handleSelectAgent(agentId: string) {
    const agent = contacts.find((a) => a.id === agentId);
    const title = agent?.name ?? "新对话";
    const conv = await createConversation(title, "single", [agentId]);
    if (conv?.id) onSelectConversation(conv.id);
    onBack();
  }

  function toggleSelection(agentId: string) {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }

  async function handleCreateGroup() {
    const ids = Array.from(selectedAgentIds);
    if (ids.length < 2) return;
    const names = ids
      .map((id) => contacts.find((c) => c.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    const title = `群聊: ${names}`;
    const conv = await createConversation(title, "group", ids);
    if (conv?.id) onSelectConversation(conv.id);
    setSelectedAgentIds(new Set());
    setIsGroupMode(false);
    onBack();
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
          placeholder="搜索 Agent..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-xs outline-none"
          style={{ color: "var(--text-primary)", fontSize: "12px" }}
          autoFocus
        />
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 flex-shrink-0" style={{ padding: "0 14px 10px" }}>
        <button
          onClick={() => { setIsGroupMode(false); setSelectedAgentIds(new Set()); }}
          className="flex-1 rounded-md py-1.5 text-xs font-medium transition-all cursor-pointer"
          style={{
            background: !isGroupMode ? "var(--text-primary)" : "transparent",
            color: !isGroupMode ? "var(--bg-app)" : "var(--text-tertiary)",
            border: "none",
          }}
        >
          单聊
        </button>
        <button
          onClick={() => { setIsGroupMode(true); setSelectedAgentIds(new Set()); }}
          className="flex-1 rounded-md py-1.5 text-xs font-medium transition-all cursor-pointer"
          style={{
            background: isGroupMode ? "var(--text-primary)" : "transparent",
            color: isGroupMode ? "var(--bg-app)" : "var(--text-tertiary)",
            border: "none",
          }}
        >
          群聊
        </button>
      </div>

      {/* Selected count in group mode */}
      {isGroupMode && selectedAgentIds.size > 0 && (
        <div
          className="flex-shrink-0 text-xs"
          style={{ padding: "0 14px 8px", color: "var(--text-tertiary)" }}
        >
          已选 {selectedAgentIds.size} 个 Agent
          {selectedAgentIds.size < 2 && "（至少选 2 个）"}
        </div>
      )}

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: "0 8px" }}>
        {filteredContacts.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-10 text-center"
            style={{ color: "var(--text-tertiary)", fontSize: "11px" }}
          >
            <p>{searchQuery ? "没有匹配的 Agent" : "暂无可用 Agent"}</p>
          </div>
        ) : (
          filteredContacts.map((agent) => {
            const isSelected = selectedAgentIds.has(agent.id);
            return (
              <button
                key={agent.id}
                onClick={() => {
                  if (isGroupMode) toggleSelection(agent.id);
                  else handleSelectAgent(agent.id);
                }}
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-xs transition-colors w-full text-left"
                style={{
                  color: "var(--text-primary)",
                  background: isSelected ? "var(--bg-hover)" : "transparent",
                  marginBottom: "2px",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                {isGroupMode && (
                  <span
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      border: `1.5px solid ${isSelected ? "var(--text-primary)" : "var(--border)"}`,
                      background: isSelected ? "var(--text-primary)" : "transparent",
                      color: isSelected ? "var(--bg-app)" : "transparent",
                      fontSize: "9px",
                    }}
                  >
                    {isSelected ? "✓" : ""}
                  </span>
                )}
                <span
                  className="flex items-center justify-center text-white font-medium rounded-full flex-shrink-0"
                  style={{
                    width: "24px",
                    height: "24px",
                    background: getAgentColor(agent.name),
                    fontSize: "9px",
                  }}
                >
                  {agent.name[0]?.toUpperCase() ?? "?"}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="truncate" style={{ fontSize: "12px", fontWeight: 500 }}>
                    {agent.name}
                  </span>
                  <span className="truncate" style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                    {agent.provider}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Create group button */}
      {isGroupMode && (
        <div className="flex-shrink-0" style={{ padding: "8px 14px" }}>
          <button
            onClick={handleCreateGroup}
            disabled={selectedAgentIds.size < 2}
            className="w-full rounded-md py-2 text-xs font-medium transition-all cursor-pointer"
            style={{
              background: selectedAgentIds.size >= 2 ? "var(--text-primary)" : "var(--bg-hover)",
              color: selectedAgentIds.size >= 2 ? "var(--bg-app)" : "var(--text-tertiary)",
              border: "none",
              opacity: selectedAgentIds.size >= 2 ? 1 : 0.5,
            }}
            onMouseEnter={(e) => {
              if (selectedAgentIds.size >= 2) e.currentTarget.style.opacity = "0.85";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = selectedAgentIds.size >= 2 ? "1" : "0.5";
            }}
          >
            创建群聊 ({selectedAgentIds.size} 个 Agent)
          </button>
        </div>
      )}
    </div>
  );
}
