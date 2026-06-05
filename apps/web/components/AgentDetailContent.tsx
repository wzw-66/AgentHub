"use client";

interface AgentData {
  id: string;
  name: string;
  provider: string;
  model?: string | null;
  avatarUrl?: string;
  systemPrompt?: string | null;
  config?: Record<string, unknown> | null;
}

interface AgentDetailContentProps {
  agent: AgentData;
}

export default function AgentDetailContent({ agent }: AgentDetailContentProps) {
  const avatarColors: Record<string, string> = {
    claude: "var(--theme-warning)", opencode: "var(--theme-success)", custom: "var(--theme-accent)",
  };

  return (
    <div className="px-6 py-8">
      <div className="flex flex-col items-center mb-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white mb-3"
          style={{ background: avatarColors[agent.provider] || "var(--theme-accent)" }}>
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-xl font-semibold" style={{ color: "var(--theme-text-primary)" }}>{agent.name}</h2>
        <p className="text-xs mt-1" style={{ color: "var(--theme-text-dim)" }}>
          {agent.provider}{agent.model ? ` · ${agent.model}` : ""}
        </p>
      </div>
      <div className="space-y-4">
        {agent.systemPrompt && (
          <div>
            <h3 className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--theme-text-dim)" }}>系统提示词</h3>
            <div className="rounded-lg border p-3 text-xs leading-relaxed"
              style={{ background: "var(--theme-bg-secondary)", borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}>
              {agent.systemPrompt}
            </div>
          </div>
        )}
        <div>
          <h3 className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: "var(--theme-text-dim)" }}>配置信息</h3>
          <div className="rounded-lg border p-3 text-xs"
            style={{ background: "var(--theme-bg-secondary)", borderColor: "var(--theme-border-light)", color: "var(--theme-text-secondary)" }}>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="font-medium" style={{ color: "var(--theme-text-dim)" }}>ID</span><p className="font-mono mt-0.5">{agent.id}</p></div>
              <div><span className="font-medium" style={{ color: "var(--theme-text-dim)" }}>提供商</span><p className="mt-0.5">{agent.provider}</p></div>
              {agent.model && <div><span className="font-medium" style={{ color: "var(--theme-text-dim)" }}>模型</span><p className="mt-0.5">{agent.model}</p></div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
