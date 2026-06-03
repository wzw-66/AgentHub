"use client";

import { AgentAvatar } from "@agenthub/ui";
import { useI18n } from "@/lib/i18n";

interface MarketAgentCardAgent {
  id: string;
  name: string;
  provider: string;
  avatarUrl?: string | null;
  model?: string | null;
  description?: string | null;
  tags: string[];
  importCount: number;
  creator?: { name: string };
}

interface MarketAgentCardProps {
  agent: MarketAgentCardAgent;
  onClick: (id: string) => void;
}

export default function MarketAgentCard({ agent, onClick }: MarketAgentCardProps) {
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
      <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl ?? undefined} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate" style={{ color: "var(--theme-text-primary)" }}>
            {agent.name}
          </p>
          {agent.tags.length > 0 && (
            <div className="flex gap-1 flex-shrink-0">
              {agent.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full px-2 py-0.5 font-mono text-[10px]"
                  style={{ backgroundColor: "var(--theme-accent-dim)", color: "var(--theme-accent)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
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
          {agent.creator?.name && (
            <>
              <span style={{ color: "var(--theme-text-muted)" }}>·</span>
              <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
                by {agent.creator.name}
              </span>
            </>
          )}
          <span style={{ color: "var(--theme-text-muted)" }}>·</span>
          <span className="font-mono text-xs" style={{ color: "var(--theme-text-muted)" }}>
            {agent.importCount} {t("agentMarket").imports || "imports"}
          </span>
        </div>
        {agent.description && (
          <p className="mt-1 font-mono text-xs truncate" style={{ color: "var(--theme-text-muted)" }}>
            {agent.description}
          </p>
        )}
      </div>
      <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="var(--theme-text-muted)" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
