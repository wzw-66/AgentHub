"use client";

import { AgentAvatar } from "@agenthub/ui";

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

const PROVIDER_LABELS: Record<string, string> = {
  claude: "Claude",
  opencode: "OpenCode",
  custom: "自定义",
};

export default function AgentCard({ agent, onClick }: AgentCardProps) {
  return (
    <button
      onClick={() => onClick(agent.id)}
      className="flex w-full items-center gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4 text-left transition-colors hover:border-blue-300 hover:shadow-sm"
    >
      <AgentAvatar
        name={agent.name}
        avatarUrl={agent.avatarUrl}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {agent.name}
        </p>
        <p className="text-xs text-gray-500">
          {PROVIDER_LABELS[agent.provider] || agent.provider}
          {agent.model && ` · ${agent.model}`}
        </p>
      </div>
      <svg
        className="h-4 w-4 flex-shrink-0 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}
