"use client";

import { AgentAvatar } from "@agenthub/ui";
import { useI18n } from "@/lib/i18n";

interface AgentDetailAgent {
  id: string;
  name: string;
  provider: string;
  model?: string | null;
  avatarUrl?: string;
  systemPrompt?: string | null;
}

interface AgentDetailContentProps {
  agent: AgentDetailAgent;
}

export default function AgentDetailContent({ agent }: AgentDetailContentProps) {
  const { t } = useI18n();

  const providerLabel = (provider: string): string => {
    const labels = t("agentInfo").providerLabels;
    return labels[provider as keyof typeof labels] || provider.toUpperCase();
  };

  return (
    <div className="flex flex-col px-6 py-8">
      {/* Avatar + name */}
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl} size="lg" />
          <div
            className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 pulse-glow"
            style={{
              backgroundColor: "var(--theme-accent)",
              borderColor: "var(--theme-bg-primary)",
            }}
          />
        </div>
        <h2 className="mt-4 font-mono text-lg font-semibold" style={{ color: "var(--theme-text-primary)" }}>
          {agent.name}
        </h2>
        <span className="font-mono text-xs tracking-wider" style={{ color: "var(--theme-accent)" }}>
          {providerLabel(agent.provider)}
        </span>
      </div>

      {/* Details */}
      <div className="mt-8 space-y-4">
        {agent.model && (
          <div>
            <p className="font-mono text-xs tracking-wider mb-1" style={{ color: "var(--theme-text-muted)" }}>
              {t("agentInfo").model}
            </p>
            <p className="font-mono text-xs" style={{ color: "var(--theme-text-primary)" }}>
              {agent.model}
            </p>
          </div>
        )}
        {agent.systemPrompt && (
          <div>
            <p className="font-mono text-xs tracking-wider mb-1.5" style={{ color: "var(--theme-text-muted)" }}>
              {t("agentInfo").systemPrompt}
            </p>
            <div
              className="rounded-lg border p-3"
              style={{
                borderColor: "var(--theme-border)",
                backgroundColor: "var(--theme-bg-surface)",
              }}
            >
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed" style={{ color: "var(--theme-text-secondary)", fontFamily: "var(--ui-font-mono)" }}>
                {agent.systemPrompt}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
