import type { AgentProvider } from "../enums/agent.js";

export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCredential {
  id: string;
  userId: string;
  provider: AgentProvider;
  apiKey: string;
  baseUrl?: string;
  createdAt: string;
  updatedAt: string;
}
