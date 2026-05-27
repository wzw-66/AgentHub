"use client";

import { AgentAvatar } from "@agenthub/ui";

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

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  opencode: "OpenCode",
  custom: "自定义",
};

export default function AgentDetailContent({ agent }: AgentDetailContentProps) {
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <AgentAvatar
        name={agent.name}
        avatarUrl={agent.avatarUrl}
        size="lg"
      />
      <h2 className="mt-4 text-lg font-semibold text-gray-900">
        {agent.name}
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        {PROVIDER_LABELS[agent.provider] || agent.provider}
      </p>

      <div className="mt-6 w-full space-y-4 text-left">
        {agent.model && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">模型</p>
            <p className="mt-1 text-sm text-gray-900">{agent.model}</p>
          </div>
        )}
        {agent.systemPrompt && (
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">系统提示词</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700 font-mono">
              {agent.systemPrompt}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
