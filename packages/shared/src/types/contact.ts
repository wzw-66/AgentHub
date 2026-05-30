import type { AgentProvider } from "../enums/agent.js";

export interface Contact {
  id: string;
  userId: string;
  name: string;
  provider: AgentProvider;
  model?: string;
  systemPrompt?: string;
  config: Record<string, unknown>;
  avatarUrl?: string;
  workspacePath?: string;
  displayName?: string;
  tags: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}
