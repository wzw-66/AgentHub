import type { AgentProvider } from "../enums/agent.js";

export interface AgentConfig {
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface Agent {
  id: string;
  name: string;
  provider: AgentProvider;
  model: string;
  systemPrompt?: string;
  config: Record<string, unknown>;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type { AgentProvider } from "../enums/agent.js";
