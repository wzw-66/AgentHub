"use client";

import { AgentAvatar } from "@agenthub/ui";
import { useI18n } from "@/lib/i18n";

interface AgentCardAgent {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string;
  model?: string | null;
}

interface AgentCardProps {
  agent: AgentCardAgent;
  onClick: (id: string) => void;
}

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  const { t } = useI18n();

  const providerLabel = (provider: string): string => {
    const labels = t("agentInfo").providerLabels;
    return labels[provider as keyof typeof labels] || provider.toUpperCase();
  };

  return (
    <button
      onClick={() => onClick(agent.id)}
      className="hover-card flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left animate-fade-in-up"
      style={{
        borderColor: "var(--theme-border)",
        backgroundColor: "var(--theme-bg-surface)",
      }}
    >
      <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>
          {agent.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-accent)" }}>
            {providerLabel(agent.provider)}
          </span>
          {agent.model && (
            <>
              <span style={{ color: "var(--theme-text-muted)" }}>·</span>
              <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                {agent.model}
              </span>
            </>
          )}
        </div>
      </div>
      <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="var(--theme-text-muted)" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
