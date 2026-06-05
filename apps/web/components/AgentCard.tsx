"use client";

interface AgentInfo {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
  model?: string | null;
}

interface AgentCardProps {
  agent: AgentInfo;
  onClick: (id: string) => void;
}

const providerLabels: Record<string, string> = {
  claude: "Claude",
  opencode: "OpenCode",
  custom: "自定义",
};

const avatarColors: Record<string, string> = {
  claude: "var(--theme-warning)",
  opencode: "var(--theme-success)",
  custom: "var(--theme-accent)",
};

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  const providerLabel = providerLabels[agent.provider] || agent.provider;
  const modelInfo = agent.model ? ` · ${agent.model}` : "";
  const avatarLetter = agent.name.charAt(0).toUpperCase();

  return (
    <button
      onClick={() => onClick(agent.id)}
      className="agent-item flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all hover:translate-x-1"
      style={{ background: "var(--theme-bg-surface)", borderColor: "var(--theme-border-light)" }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-white"
        style={{ background: avatarColors[agent.provider] || "var(--theme-accent)" }}
      >
        {avatarLetter}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>
          {agent.name}
        </div>
        <div className="text-xs truncate" style={{ color: "var(--theme-text-dim)" }}>
          {providerLabel}{modelInfo}
        </div>
      </div>
    </button>
  );
}
