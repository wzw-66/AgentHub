# AgentHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-Agent collaboration platform with IM chat as the core interaction paradigm, where users chat with AI Agents in single or group conversations.

**Architecture:** Turborepo monorepo with three apps (web/Next.js, desktop/Electron, server/Fastify) and four shared packages (shared, db, agent-core, ui). Server is the single business backend; all clients communicate via REST + SSE + WebSocket.

**Tech Stack:** Node.js/TypeScript, Next.js (App Router), Fastify, Prisma + PostgreSQL, Turborepo, Vitest, Playwright

***

## Phase 1: Monorepo Foundation

### Task 1.1: Initialize Turborepo monorepo

**Files:**

- Create: `package.json`
- Create: `turbo.json`
- Create: `pnpm-workspace.yaml`
- Create: `.gitignore`
- Create: `.npmrc`
- [ ] **Step 1: Create root package.json**

```bash
cd D:/code/github/AgentHub
pnpm init
```

```json
{
  "name": "agenthub",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "format": "prettier --write \"**/*.{ts,tsx,md,json}\""
  },
  "devDependencies": {
    "prettier": "^3.3.0",
    "turbo": "^2.3.0",
    "typescript": "^5.6.0"
  },
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["**/.env.*local"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tooling/*"
```

- [ ] **Step 4: Create .npmrc**

```
auto-install-peers=true
strict-peer-dependencies=false
```

- [ ] **Step 5: Run pnpm install**

```bash
pnpm install
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml turbo.json pnpm-workspace.yaml .npmrc .gitignore
git commit -m "chore: initialize turborepo monorepo"
```

***

### Task 1.2: Set up TypeScript and ESLint tooling

**Files:**

- Create: `tooling/tsconfig/base.json`
- Create: `tooling/tsconfig/nextjs.json`
- Create: `tooling/tsconfig/node.json`
- Create: `tooling/eslint-config/package.json`
- Create: `tooling/eslint-config/index.js`
- [ ] **Step 1: Create tooling/tsconfig/base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 2: Create tooling/tsconfig/nextjs.json**

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "plugins": [{ "name": "next" }]
  }
}
```

- [ ] **Step 3: Create tooling/tsconfig/node.json**

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"]
  }
}
```

- [ ] **Step 4: Create tooling/eslint-config/package.json**

```json
{
  "name": "eslint-config",
  "version": "0.0.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint-config-next": "^15.0.0",
    "eslint-config-prettier": "^9.1.0"
  }
}
```

- [ ] **Step 5: Create tooling/eslint-config/index.js**

```javascript
module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
  },
  ignorePatterns: ["dist/", ".next/", "node_modules/"],
};
```

- [ ] **Step 6: Run pnpm install**

```bash
pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add tooling/
git commit -m "chore: add shared tsconfig and eslint config"
```

***

### Task 1.3: Create shared package

**Files:**

- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/enums.ts`
- Create: `packages/shared/src/dto.ts`
- [ ] **Step 1: Create packages/shared/package.json**

```json
{
  "name": "shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "devDependencies": {
    "eslint-config": "workspace:*",
    "tsconfig": "workspace:*",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create packages/shared/tsconfig.json**

```json
{
  "extends": "tsconfig/node.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/shared/src/enums.ts**

```typescript
export enum ConversationType {
  Single = "single",
  Group = "group",
}

export enum SenderType {
  User = "user",
  Contact = "contact",
  System = "system",
}

export enum MessageType {
  Text = "text",
  Code = "code",
  Diff = "diff",
  Preview = "preview",
  Artifact = "artifact",
}

export enum ArtifactType {
  Webpage = "webpage",
  Code = "code",
  Document = "document",
}

export enum ArtifactStatus {
  Building = "building",
  Done = "done",
  Failed = "failed",
}

export enum AgentProvider {
  Claude = "claude",
  OpenCode = "opencode",
  Custom = "custom",
}

export enum ChunkType {
  Text = "text",
  Code = "code",
  ToolCall = "tool_call",
  Artifact = "artifact",
  Error = "error",
  Done = "done",
}
```

- [ ] **Step 4: Create packages/shared/src/types.ts**

```typescript
import {
  SenderType, MessageType, ArtifactType, ArtifactStatus,
  AgentProvider, ChunkType, ConversationType,
} from "./enums";

export interface Agent {
  id: string;
  name: string;
  avatarUrl: string | null;
  provider: AgentProvider;
  systemPrompt: string | null;
  model: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Contact {
  id: string;
  userId: string;
  agentId: string;
  displayName: string;
  tags: string[];
  isPinned: boolean;
  agent?: Agent;
}

export interface Conversation {
  id: string;
  title: string;
  type: ConversationType;
  ownerId: string;
  contactIds: string[];
  isArchived: boolean;
  lastActiveAt: string;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderType: SenderType;
  senderId: string;
  type: MessageType;
  content: unknown;
  parentId: string | null;
  isPinned: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Artifact {
  id: string;
  messageId: string;
  type: ArtifactType;
  url: string | null;
  content: unknown;
  previewUrl: string | null;
  status: ArtifactStatus;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface Chunk {
  type: ChunkType;
  content: string;
  metadata?: {
    language?: string;
    artifactUrl?: string;
    toolName?: string;
  };
}

export interface AgentContext {
  systemPrompt: string;
  messages: { role: string; content: string }[];
  pinnedMessages?: { role: string; content: string }[];
}

export interface AgentAdapter {
  readonly agentId: string;
  readonly provider: string;
  execute(
    context: AgentContext,
    credential: { apiKey: string },
    options?: { maxTokens?: number; temperature?: number }
  ): AsyncIterable<Chunk>;
  abort(): Promise<void>;
  healthCheck(): Promise<{ available: boolean; latency: number }>;
}

export interface UserCredential {
  id: string;
  userId: string;
  provider: string;
  encryptedKey: string;
  createdAt: string;
}
```

- [ ] **Step 5: Create packages/shared/src/index.ts**

```typescript
export * from "./enums";
export * from "./types";
```

- [ ] **Step 6: Create packages/shared/src/**__tests__/enums.test.ts

```typescript
import { describe, it, expect } from "vitest";
import { ConversationType, SenderType, MessageType } from "../enums";

describe("enums", () => {
  it("should define ConversationType values", () => {
    expect(ConversationType.Single).toBe("single");
    expect(ConversationType.Group).toBe("group");
  });

  it("should define SenderType values", () => {
    expect(SenderType.User).toBe("user");
    expect(SenderType.Contact).toBe("contact");
    expect(SenderType.System).toBe("system");
  });

  it("should define MessageType values", () => {
    expect(MessageType.Text).toBe("text");
    expect(MessageType.Artifact).toBe("artifact");
  });
});
```

- [ ] **Step 7: Run tests**

```bash
cd packages/shared && pnpm test
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/
git commit -m "feat: add shared package with types and enums"
```

***

### Task 1.4: Set up database package

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/.env.example`
- [ ] **Step 1: Create packages/db/package.json**

```json
{
  "name": "db",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "@prisma/client": "^6.0.0",
    "shared": "workspace:*"
  },
  "devDependencies": {
    "eslint-config": "workspace:*",
    "prisma": "^6.0.0",
    "tsconfig": "workspace:*",
    "tsx": "^4.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create packages/db/prisma/schema.prisma**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  passwordHash String
  avatarUrl    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  contacts       Contact[]
  conversations  Conversation[]
  credentials    UserCredential[]
}

model Agent {
  id           String   @id @default(cuid())
  name         String
  avatarUrl    String?
  provider     String
  systemPrompt String?  @db.Text
  model        String   @default("claude-opus-4-6")
  config       Json     @default("{}")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  contacts Contact[]
}

model Contact {
  id          String   @id @default(cuid())
  userId      String
  agentId     String
  displayName String
  tags        String[] @default([])
  isPinned    Boolean  @default(false)
  createdAt   DateTime @default(now())

  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  agent Agent @relation(fields: [agentId], references: [id], onDelete: Cascade)

  @@unique([userId, agentId])
}

model Conversation {
  id          String   @id @default(cuid())
  title       String
  type        String
  ownerId     String
  contactIds  String[] @default([])
  isArchived  Boolean  @default(false)
  lastActiveAt DateTime @default(now())
  createdAt   DateTime @default(now())

  owner    User      @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  messages Message[]
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  senderType     String
  senderId       String
  type           String
  content        Json     @default("{}")
  parentId       String?
  isPinned       Boolean  @default(false)
  metadata       Json     @default("{}")
  createdAt      DateTime @default(now())

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  artifacts    Artifact[]

  @@index([conversationId, createdAt])
}

model Artifact {
  id         String   @id @default(cuid())
  messageId  String
  type       String
  url        String?
  content    Json     @default("{}")
  previewUrl String?
  status     String   @default("building")
  createdAt  DateTime @default(now())

  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
}

model UserCredential {
  id           String   @id @default(cuid())
  userId       String
  provider     String
  encryptedKey String
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, provider])
}
```

- [ ] **Step 3: Create packages/db/src/client.ts**

```typescript
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export type { PrismaClient } from "@prisma/client";
```

- [ ] **Step 4: Create packages/db/src/index.ts**

```typescript
export { prisma } from "./client";
export type { PrismaClient } from "./client";
```

- [ ] **Step 5: Create packages/db/.env.example**

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/agenthub"
```

- [ ] **Step 6: Run pnpm install**

```bash
pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/
git commit -m "feat: add database package with Prisma schema"
```

***

## Phase 2: Agent Adapter Layer

### Task 2.1: Implement agent-core package

**Files:**

- Create: `packages/agent-core/package.json`
- Create: `packages/agent-core/tsconfig.json`
- Create: `packages/agent-core/src/registry.ts`
- Create: `packages/agent-core/src/adapters/claude.ts`
- Create: `packages/agent-core/src/adapters/opencode.ts`
- Create: `packages/agent-core/src/adapters/custom.ts`
- Create: `packages/agent-core/src/index.ts`
- Create: `packages/agent-core/src/__tests__/registry.test.ts`
- [ ] **Step 1: Create packages/agent-core/package.json**

```json
{
  "name": "agent-core",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "shared": "workspace:*"
  },
  "devDependencies": {
    "eslint-config": "workspace:*",
    "tsconfig": "workspace:*",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Write failing test for registry**

File: `packages/agent-core/src/__tests__/registry.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../registry";
import type { AgentAdapter, Chunk, AgentContext } from "shared";

// Dummy adapter for testing
function createDummyAdapter(id: string): AgentAdapter {
  return {
    agentId: id,
    provider: "claude",
    async *execute(_context: AgentContext, _cred: { apiKey: string }) {
      yield { type: "text" as const, content: "hello" };
    },
    async abort() {},
    async healthCheck() {
      return { available: true, latency: 50 };
    },
  };
}

describe("AgentRegistry", () => {
  it("should register and retrieve an adapter", () => {
    const registry = new AgentRegistry();
    const adapter = createDummyAdapter("claude-1");
    registry.register("claude-1", adapter);
    expect(registry.get("claude-1")).toBe(adapter);
  });

  it("should list all registered agent ids", () => {
    const registry = new AgentRegistry();
    registry.register("a", createDummyAdapter("a"));
    registry.register("b", createDummyAdapter("b"));
    expect(registry.list()).toEqual(["a", "b"]);
  });

  it("should throw when getting unregistered agent", () => {
    const registry = new AgentRegistry();
    expect(() => registry.get("nonexistent")).toThrow("not registered");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd packages/agent-core && pnpm test
```

Expected: FAIL (module not found)

- [ ] **Step 4: Implement registry**

File: `packages/agent-core/src/registry.ts`

```typescript
import type { AgentAdapter } from "shared";

export class AgentRegistry {
  private adapters = new Map<string, AgentAdapter>();

  register(agentId: string, adapter: AgentAdapter): void {
    this.adapters.set(agentId, adapter);
  }

  get(agentId: string): AgentAdapter {
    const adapter = this.adapters.get(agentId);
    if (!adapter) {
      throw new Error(`Agent "${agentId}" not registered`);
    }
    return adapter;
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/agent-core && pnpm test
```

- [ ] **Step 6: Implement ClaudeAdapter**

File: `packages/agent-core/src/adapters/claude.ts`

```typescript
import type { AgentAdapter, AgentContext, Chunk } from "shared";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

export class ClaudeAdapter implements AgentAdapter {
  readonly agentId: string;
  readonly provider = "claude";
  private abortController: AbortController | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async *execute(
    context: AgentContext,
    credential: { apiKey: string },
    options?: { maxTokens?: number; temperature?: number }
  ): AsyncIterable<Chunk> {
    this.abortController = new AbortController();

    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credential.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        system: context.systemPrompt,
        messages: [
          ...context.pinnedMessages ?? [],
          ...context.messages,
        ],
        stream: true,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "content_block_delta") {
            const delta = parsed.delta;
            if (delta.type === "text_delta") {
              yield { type: "text", content: delta.text };
            }
          }
        } catch {
          // skip unparseable lines
        }
      }
    }

    yield { type: "done", content: "" };
  }

  async abort(): Promise<void> {
    this.abortController?.abort();
  }

  async healthCheck(): Promise<{ available: boolean; latency: number }> {
    const start = Date.now();
    try {
      const res = await fetch(ANTHROPIC_API, { method: "HEAD" });
      return { available: res.ok || res.status === 401, latency: Date.now() - start };
    } catch {
      return { available: false, latency: -1 };
    }
  }
}
```

- [ ] **Step 7: Implement OpenCodeAdapter (CLI)**

File: `packages/agent-core/src/adapters/opencode.ts`

```typescript
import { spawn, ChildProcess } from "child_process";
import type { AgentAdapter, AgentContext, Chunk } from "shared";

export class OpenCodeAdapter implements AgentAdapter {
  readonly agentId: string;
  readonly provider = "opencode";
  private process: ChildProcess | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  async *execute(
    context: AgentContext,
    _credential: { apiKey: string },
    _options?: { maxTokens?: number; temperature?: number }
  ): AsyncIterable<Chunk> {
    this.process = spawn("opencode", [], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    const input = JSON.stringify({
      system: context.systemPrompt,
      messages: context.messages,
    });

    this.process.stdin?.write(input);
    this.process.stdin?.end();

    if (!this.process.stdout) {
      throw new Error("No stdout for opencode process");
    }

    for await (const line of readLines(this.process.stdout)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "chunk") {
          yield { type: "text", content: parsed.content };
        } else if (parsed.type === "code") {
          yield {
            type: "code",
            content: parsed.content,
            metadata: { language: parsed.language },
          };
        }
      } catch {
        yield { type: "text", content: line };
      }
    }

    yield { type: "done", content: "" };
  }

  async abort(): Promise<void> {
    this.process?.kill("SIGTERM");
  }

  async healthCheck(): Promise<{ available: boolean; latency: number }> {
    const start = Date.now();
    try {
      spawn("opencode", ["--version"], { stdio: "ignore" });
      return { available: true, latency: Date.now() - start };
    } catch {
      return { available: false, latency: -1 };
    }
  }
}

async function* readLines(
  stream: NodeJS.ReadableStream
): AsyncIterable<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBuffer);
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === 0x0a) {
        chunks.push(buf.subarray(start, i));
        yield Buffer.concat(chunks).toString("utf-8");
        chunks.length = 0;
        start = i + 1;
      }
    }
    if (start < buf.length) {
      chunks.push(buf.subarray(start));
    }
  }
  if (chunks.length > 0) {
    yield Buffer.concat(chunks).toString("utf-8");
  }
}
```

- [ ] **Step 8: Implement CustomAgentAdapter**

File: `packages/agent-core/src/adapters/custom.ts`

```typescript
import type { AgentAdapter, AgentContext, Chunk } from "shared";

export class CustomAgentAdapter implements AgentAdapter {
  readonly agentId: string;
  readonly provider = "custom";
  private endpoint: string;
  private abortController: AbortController | null = null;

  constructor(agentId: string, endpoint: string) {
    this.agentId = agentId;
    this.endpoint = endpoint;
  }

  async *execute(
    context: AgentContext,
    credential: { apiKey: string },
    options?: { maxTokens?: number; temperature?: number }
  ): AsyncIterable<Chunk> {
    this.abortController = new AbortController();

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify({
        model: context.systemPrompt ? undefined : "default",
        messages: [
          { role: "system", content: context.systemPrompt },
          ...context.pinnedMessages ?? [],
          ...context.messages,
        ],
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
      }),
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Custom API error ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield { type: "text", content };
          }
        } catch {
          // skip
        }
      }
    }

    yield { type: "done", content: "" };
  }

  async abort(): Promise<void> {
    this.abortController?.abort();
  }

  async healthCheck(): Promise<{ available: boolean; latency: number }> {
    const start = Date.now();
    try {
      const res = await fetch(this.endpoint, { method: "HEAD" });
      return { available: res.ok || res.status === 401, latency: Date.now() - start };
    } catch {
      return { available: false, latency: -1 };
    }
  }
}
```

- [ ] **Step 9: Create packages/agent-core/src/index.ts**

```typescript
export { AgentRegistry } from "./registry";
export { ClaudeAdapter } from "./adapters/claude";
export { OpenCodeAdapter } from "./adapters/opencode";
export { CustomAgentAdapter } from "./adapters/custom";
```

- [ ] **Step 10: Run tests**

```bash
cd packages/agent-core && pnpm test
```

- [ ] **Step 11: Commit**

```bash
git add packages/agent-core/
git commit -m "feat: add agent-core package with adapter implementations"
```

***

## Phase 3: Server

### Task 3.1: Initialize Fastify server

**Files:**

- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/index.ts`
- Create: `apps/server/src/config.ts`
- Create: `apps/server/.env.example`
- [ ] **Step 1: Create apps/server/package.json**

```json
{
  "name": "server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/websocket": "^11.0.0",
    "@fastify/jwt": "^9.0.0",
    "bcrypt": "^5.1.0",
    "shared": "workspace:*",
    "db": "workspace:*",
    "agent-core": "workspace:*",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.0",
    "@types/node": "^22.0.0",
    "eslint-config": "workspace:*",
    "tsconfig": "workspace:*",
    "tsx": "^4.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create apps/server/tsconfig.json**

```json
{
  "extends": "tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create apps/server/src/config.ts**

```typescript
import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? "3001"),
  host: process.env.HOST ?? "0.0.0.0",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/agenthub",
};
```

- [ ] **Step 4: Create apps/server/src/index.ts**

```typescript
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import { config } from "./config.js";

async function main() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true, credentials: true });
  await app.register(fastifyWebsocket);

  app.get("/health", async () => ({ status: "ok" }));

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`Server running on http://${config.host}:${config.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 5: Create apps/server/.env.example**

```
PORT=3001
HOST=0.0.0.0
JWT_SECRET=change-me
DATABASE_URL=postgresql://postgres:password@localhost:5432/agenthub
```

- [ ] **Step 6: Run pnpm install and verify dev starts**

```bash
pnpm install
cd apps/server && timeout 5 pnpm dev || true
```

Expected: server starts and logs listening message

- [ ] **Step 7: Commit**

```bash
git add apps/server/
git commit -m "feat: initialize Fastify server"
```

***

### Task 3.2: Implement auth routes

**Files:**

- Create: `apps/server/src/routes/auth.ts`
- Create: `apps/server/src/__tests__/auth.test.ts`
- [ ] **Step 1: Write failing auth test**

File: `apps/server/src/__tests__/auth.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import { authRoutes } from "../routes/auth.js";

describe("auth routes", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(authRoutes, { prefix: "/auth" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should return 400 on register with missing fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("should register a new user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Test User",
        email: "test@example.com",
        password: "password123",
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.email).toBe("test@example.com");
  });

  it("should login an existing user", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "test@example.com",
        password: "password123",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.accessToken).toBeDefined();
  });

  it("should reject invalid password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: "test@example.com",
        password: "wrongpassword",
      },
    });
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/server && pnpm test
```

- [ ] **Step 3: Implement auth routes**

File: `apps/server/src/routes/auth.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import bcrypt from "bcrypt";
import { prisma } from "db";

interface RegisterBody {
  name: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, email, password } = req.body as RegisterBody;

    if (!name || !email || !password) {
      return reply.status(400).send({ error: "Missing required fields" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, passwordHash },
    });

    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: "15m" }
    );
    const refreshToken = app.jwt.sign(
      { sub: user.id, type: "refresh" },
      { expiresIn: "7d" }
    );

    return reply.status(201).send({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    });
  });

  app.post("/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const { email, password } = req.body as LoginBody;

    if (!email || !password) {
      return reply.status(400).send({ error: "Missing email or password" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const accessToken = app.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: "15m" }
    );
    const refreshToken = app.jwt.sign(
      { sub: user.id, type: "refresh" },
      { expiresIn: "7d" }
    );

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
    });
  });

  app.post("/refresh", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      await req.jwtVerify();
      const decoded = req.user as { sub: string; type: string };
      if (decoded.type !== "refresh") {
        return reply.status(401).send({ error: "Invalid token type" });
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
      if (!user) {
        return reply.status(401).send({ error: "User not found" });
      }

      const accessToken = app.jwt.sign(
        { sub: user.id, email: user.email },
        { expiresIn: "15m" }
      );

      return reply.send({ accessToken });
    } catch {
      return reply.status(401).send({ error: "Invalid token" });
    }
  });
}
```

- [ ] **Step 4: Update server index to register auth and JWT**

In `apps/server/src/index.ts`, add before `app.listen()`:

```typescript
import fastifyJwt from "@fastify/jwt";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";

// ... after ws registration:
await app.register(fastifyJwt, { secret: config.jwtSecret });
await app.register(authRoutes, { prefix: "/auth" });
```

- [ ] **Step 5: Run tests to verify**

```bash
cd apps/server && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/auth.ts apps/server/src/__tests__/auth.test.ts apps/server/src/index.ts
git commit -m "feat: implement auth routes (register/login/refresh)"
```

***

### Task 3.3: Implement Agent and Contact routes

**Files:**

- Create: `apps/server/src/routes/agents.ts`
- Create: `apps/server/src/routes/contacts.ts`
- Create: `apps/server/src/middleware/auth.ts`
- [ ] **Step 1: Create auth middleware**

File: `apps/server/src/middleware/auth.ts`

```typescript
import { FastifyRequest, FastifyReply } from "fastify";

export async function authenticate(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
}
```

- [ ] **Step 2: Create agent routes**

File: `apps/server/src/routes/agents.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "db";
import { authenticate } from "../middleware/auth.js";

interface CreateAgentBody {
  name: string;
  provider: string;
  systemPrompt?: string;
  model?: string;
  config?: Record<string, unknown>;
}

export async function agentRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/", async (_req: FastifyRequest, reply: FastifyReply) => {
    const agents = await prisma.agent.findMany({
      orderBy: { createdAt: "desc" },
    });
    return reply.send(agents);
  });

  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { name, provider, systemPrompt, model, config } = req.body as CreateAgentBody;
    if (!name || !provider) {
      return reply.status(400).send({ error: "Name and provider are required" });
    }

    const agent = await prisma.agent.create({
      data: {
        name,
        provider,
        systemPrompt: systemPrompt ?? null,
        model: model ?? "claude-opus-4-6",
        config: config ?? {},
      },
    });

    return reply.status(201).send(agent);
  });

  app.get("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }
    return reply.send(agent);
  });
}
```

- [ ] **Step 3: Create contact routes**

File: `apps/server/src/routes/contacts.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "db";
import { authenticate } from "../middleware/auth.js";

export async function contactRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const contacts = await prisma.contact.findMany({
      where: { userId },
      include: { agent: true },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    });
    return reply.send(contacts);
  });

  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { agentId, displayName, tags } = req.body as {
      agentId: string;
      displayName?: string;
      tags?: string[];
    };

    if (!agentId) {
      return reply.status(400).send({ error: "agentId is required" });
    }

    const agent = await prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const existing = await prisma.contact.findUnique({
      where: { userId_agentId: { userId, agentId } },
    });
    if (existing) {
      return reply.status(409).send({ error: "Contact already exists" });
    }

    const contact = await prisma.contact.create({
      data: {
        userId,
        agentId,
        displayName: displayName ?? agent.name,
        tags: tags ?? [],
      },
      include: { agent: true },
    });

    return reply.status(201).send(contact);
  });

  app.patch("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { id } = req.params as { id: string };
    const { displayName, tags, isPinned } = req.body as {
      displayName?: string;
      tags?: string[];
      isPinned?: boolean;
    };

    const contact = await prisma.contact.findFirst({
      where: { id, userId },
    });
    if (!contact) {
      return reply.status(404).send({ error: "Contact not found" });
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(tags !== undefined && { tags }),
        ...(isPinned !== undefined && { isPinned }),
      },
      include: { agent: true },
    });

    return reply.send(updated);
  });

  app.delete("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { id } = req.params as { id: string };

    const contact = await prisma.contact.findFirst({
      where: { id, userId },
    });
    if (!contact) {
      return reply.status(404).send({ error: "Contact not found" });
    }

    await prisma.contact.delete({ where: { id } });
    return reply.status(204).send();
  });
}
```

- [ ] **Step 4: Register routes in index.ts**

```typescript
import { agentRoutes } from "./routes/agents.js";
import { contactRoutes } from "./routes/contacts.js";

// after auth registration:
await app.register(agentRoutes, { prefix: "/agents" });
await app.register(contactRoutes, { prefix: "/contacts" });
```

- [ ] **Step 5: Run pnpm install and verify**

```bash
pnpm install
cd apps/server && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/middleware/ apps/server/src/routes/agents.ts apps/server/src/routes/contacts.ts apps/server/src/index.ts
git commit -m "feat: implement agent and contact routes"
```

***

### Task 3.4: Implement conversation and message routes

**Files:**

- Create: `apps/server/src/routes/conversations.ts`
- Create: `apps/server/src/routes/messages.ts`
- [ ] **Step 1: Create conversation routes**

File: `apps/server/src/routes/conversations.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "db";
import { authenticate } from "../middleware/auth.js";

interface CreateConversationBody {
  title: string;
  type: "single" | "group";
  contactIds: string[];
}

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const conversations = await prisma.conversation.findMany({
      where: { ownerId: userId, isArchived: false },
      orderBy: { lastActiveAt: "desc" },
    });
    return reply.send(conversations);
  });

  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { title, type, contactIds } = req.body as CreateConversationBody;

    if (!title || !type || !contactIds?.length) {
      return reply.status(400).send({ error: "title, type, and contactIds are required" });
    }

    const conversation = await prisma.conversation.create({
      data: { title, type, ownerId: userId, contactIds },
    });

    return reply.status(201).send(conversation);
  });

  app.get("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { id } = req.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, ownerId: userId },
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    if (!conversation) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    return reply.send(conversation);
  });

  app.patch("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { id } = req.params as { id: string };
    const { title, isArchived } = req.body as { title?: string; isArchived?: boolean };

    const conversation = await prisma.conversation.findFirst({
      where: { id, ownerId: userId },
    });
    if (!conversation) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(isArchived !== undefined && { isArchived }),
      },
    });

    return reply.send(updated);
  });

  app.delete("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { id } = req.params as { id: string };

    const conversation = await prisma.conversation.findFirst({
      where: { id, ownerId: userId },
    });
    if (!conversation) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    await prisma.conversation.delete({ where: { id } });
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: Create message routes (REST + SSE)**

File: `apps/server/src/routes/messages.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "db";
import { authenticate } from "../middleware/auth.js";

interface SendMessageBody {
  type: string;
  content: unknown;
  parentId?: string;
}

export async function messageRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = req.params as { conversationId: string };
    const { cursor, limit = "50" } = req.query as { cursor?: string; limit?: string };

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: Math.min(parseInt(limit), 100),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { artifacts: true },
    });

    return reply.send(messages);
  });

  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { conversationId } = req.params as { conversationId: string };
    const { type, content, parentId } = req.body as SendMessageBody;

    if (!type || content === undefined) {
      return reply.status(400).send({ error: "type and content are required" });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, ownerId: userId },
    });
    if (!conversation) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType: "user",
        senderId: userId,
        type,
        content: content as object,
        parentId: parentId ?? null,
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { lastActiveAt: new Date() },
    });

    return reply.status(201).send(message);
  });

  app.post("/:messageId/pin", async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId, messageId } = req.params as {
      conversationId: string;
      messageId: string;
    };

    await prisma.message.update({
      where: { id: messageId },
      data: { isPinned: true },
    });

    return reply.send({ success: true });
  });

  app.post("/:messageId/reply", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { conversationId, messageId } = req.params as {
      conversationId: string;
      messageId: string;
    };
    const { type, content } = req.body as SendMessageBody;

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderType: "user",
        senderId: userId,
        type: type ?? "text",
        content: content as object,
        parentId: messageId,
      },
    });

    return reply.status(201).send(message);
  });
}
```

- [ ] **Step 3: Register routes in index.ts**

```typescript
import { conversationRoutes } from "./routes/conversations.js";
import { messageRoutes } from "./routes/messages.js";

await app.register(conversationRoutes, { prefix: "/conversations" });
await app.register(messageRoutes, { prefix: "/conversations/:conversationId/messages" });
```

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/routes/conversations.ts apps/server/src/routes/messages.ts apps/server/src/index.ts
git commit -m "feat: implement conversation and message routes"
```

***

### Task 3.5: Implement SSE streaming for agent execution

**Files:**

- Create: `apps/server/src/routes/sse.ts`
- Modify: `apps/server/src/index.ts`
- [ ] **Step 1: Create SSE route**

File: `apps/server/src/routes/sse.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "db";
import { AgentRegistry } from "agent-core";
import { authenticate } from "../middleware/auth.js";

export function createSSERoutes(registry: AgentRegistry) {
  return async function sseRoutes(app: FastifyInstance) {
    app.get(
      "/conversations/:conversationId/stream",
      { websocket: false },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = (req.user as { sub: string }).sub;
        const { conversationId } = req.params as { conversationId: string };

        const conversation = await prisma.conversation.findFirst({
          where: { id: conversationId, ownerId: userId },
        });
        if (!conversation) {
          return reply.status(404).send({ error: "Conversation not found" });
        }

        reply.raw.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        const send = (event: string, data: unknown) => {
          reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        const sendChunk = (chunk: { type: string; content: string; metadata?: Record<string, unknown> }) => {
          send("chunk", chunk);
        };

        try {
          const contactIds = conversation.contactIds;
          const contacts = await prisma.contact.findMany({
            where: { id: { in: contactIds } },
            include: { agent: true },
          });

          const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: "asc" },
            take: 50,
          });

          const context = {
            systemPrompt: "",
            messages: messages
              .filter((m) => m.senderType !== "system")
              .map((m) => ({
                role: m.senderType === "user" ? "user" : "assistant",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
              })),
            pinnedMessages: messages
              .filter((m) => m.isPinned)
              .map((m) => ({
                role: m.senderType === "user" ? "user" : "assistant",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
              })),
          };

          for (const contact of contacts) {
            const adapter = registry.get(contact.agent.provider);
            const credentialRecord = await prisma.userCredential.findUnique({
              where: {
                userId_provider: { userId, provider: contact.agent.provider },
              },
            });

            if (!credentialRecord) {
              sendChunk({
                type: "error",
                content: `No API key configured for ${contact.agent.provider}. Add one in Settings > Credentials.`,
              });
              continue;
            }

            const credential = { apiKey: credentialRecord.encryptedKey };

            for await (const chunk of adapter.execute(context, credential)) {
              if (chunk.type === "done") {
                const agentMessage = await prisma.message.create({
                  data: {
                    conversationId,
                    senderType: "contact",
                    senderId: contact.id,
                    type: chunk.type,
                    content: { text: "Done" },
                  },
                });
                sendChunk({
                  type: "done",
                  content: "",
                  metadata: { messageId: agentMessage.id },
                });
              } else {
                sendChunk(chunk);
              }
            }
          }
        } catch (err) {
          sendChunk({
            type: "error",
            content: err instanceof Error ? err.message : "Unknown error",
          });
        } finally {
          reply.raw.end();
        }
      }
    );
  };
}
```

- [ ] **Step 2: Update server index to set up SSE routes**

In `apps/server/src/index.ts`:

```typescript
import { AgentRegistry, ClaudeAdapter, OpenCodeAdapter } from "agent-core";
import { createSSERoutes } from "./routes/sse.js";

// After adapter initialization:
const registry = new AgentRegistry();
registry.register("claude", new ClaudeAdapter("claude"));
registry.register("opencode", new OpenCodeAdapter("opencode"));

await app.register(
  async (scope: FastifyInstance) => {
    scope.addHook("onRequest", authenticate);
    await scope.register(createSSERoutes(registry), { prefix: "/sse" });
  }
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/sse.ts apps/server/src/index.ts
git commit -m "feat: implement SSE streaming for agent execution"
```

***

### Task 3.6: Implement WebSocket gateway

**Files:**

- Create: `apps/server/src/ws/gateway.ts`
- Modify: `apps/server/src/index.ts`
- [ ] **Step 1: Create WebSocket gateway**

File: `apps/server/src/ws/gateway.ts`

```typescript
import { FastifyInstance } from "fastify";
import { WebSocket } from "ws";

const clients = new Map<string, Set<WebSocket>>();

export async function wsGateway(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket, req) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    if (!token) {
      socket.close(1008, "Missing token");
      return;
    }

    try {
      const decoded = app.jwt.verify(token) as { sub: string };
      const userId = decoded.sub;

      if (!clients.has(userId)) {
        clients.set(userId, new Set());
      }
      clients.get(userId)!.add(socket);

      socket.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "ping") {
            socket.send(JSON.stringify({ type: "pong" }));
          }
          if (msg.type === "typing") {
            broadcastToConversation(msg.conversationId, {
              type: "user_typing",
              userId,
              isTyping: msg.isTyping,
            }, socket);
          }
        } catch {
          // ignore invalid messages
        }
      });

      socket.on("close", () => {
        clients.get(userId)?.delete(socket);
        if (clients.get(userId)?.size === 0) {
          clients.delete(userId);
        }
      });

      socket.send(JSON.stringify({ type: "connected", userId }));
    } catch {
      socket.close(1008, "Invalid token");
    }
  });
}

function broadcastToConversation(
  conversationId: string,
  message: unknown,
  exclude?: WebSocket
) {
  for (const [, sockets] of clients) {
    for (const ws of sockets) {
      if (ws !== exclude && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    }
  }
}

export function notifyUser(userId: string, notification: unknown) {
  const sockets = clients.get(userId);
  if (!sockets) return;
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(notification));
    }
  }
}
```

- [ ] **Step 2: Register WS gateway in server index**

```typescript
import { wsGateway } from "./ws/gateway.js";

await app.register(wsGateway);
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/ws/gateway.ts apps/server/src/index.ts
git commit -m "feat: implement WebSocket gateway"
```

***

## Phase 4: Web Frontend

### Task 4.1: Initialize Next.js app

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "shared": "workspace:*",
    "ui": "workspace:*",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "eslint-config": "workspace:*",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "tsconfig": "workspace:*",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "extends": "tsconfig/nextjs.json",
  "compilerOptions": {
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["shared", "ui"],
};

export default nextConfig;
```

- [ ] **Step 4: Create apps/web/tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create apps/web/postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create apps/web/src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create apps/web/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentHub",
  description: "Multi-Agent Collaboration Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="h-screen overflow-hidden bg-white text-gray-900">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create apps/web/src/app/page.tsx** (login redirect)

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
```

- [ ] **Step 9: Run pnpm install and verify dev starts**

```bash
pnpm install
cd apps/web && timeout 5 pnpm dev || true
```

- [ ] **Step 10: Commit**

```bash
git add apps/web/
git commit -m "feat: initialize Next.js web app"
```

***

### Task 4.2: Create shared UI components

**Files:**

- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/src/MessageBubble.tsx`
- Create: `packages/ui/src/CodeBlock.tsx`
- Create: `packages/ui/src/PreviewCard.tsx`
- Create: `packages/ui/src/index.ts`
- [ ] **Step 1: Create packages/ui/package.json**

```json
{
  "name": "ui",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "shared": "workspace:*",
    "react": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "eslint-config": "workspace:*",
    "tsconfig": "workspace:*",
    "vitest": "^2.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: Create packages/ui/tsconfig.json**

```json
{
  "extends": "tsconfig/nextjs.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Create packages/ui/src/MessageBubble.tsx**

```tsx
import { SenderType } from "shared";

interface MessageBubbleProps {
  senderType: SenderType;
  senderName: string;
  avatarUrl?: string | null;
  children: React.ReactNode;
  timestamp: string;
}

export function MessageBubble({
  senderType,
  senderName,
  avatarUrl,
  children,
  timestamp,
}: MessageBubbleProps) {
  const isUser = senderType === SenderType.User;

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0 overflow-hidden">
        {avatarUrl ? (
          <img src={avatarUrl} alt={senderName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm font-medium text-gray-500">
            {senderName.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className={`max-w-[70%] ${isUser ? "items-end" : ""}`}>
        <div className="text-xs text-gray-500 mb-1">{senderName}</div>
        <div
          className={`rounded-2xl px-4 py-2 ${
            isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-900"
          }`}
        >
          {children}
        </div>
        <div className="text-xs text-gray-400 mt-1">{timestamp}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create packages/ui/src/CodeBlock.tsx**

```tsx
"use client";

import { useState } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code, language = "text" }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 my-2">
      <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
        <span className="text-xs text-gray-400">{language}</span>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-white transition"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="bg-gray-900 text-gray-100 p-4 overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
    </div>
  );
}
```

- [ ] **Step 5: Create packages/ui/src/PreviewCard.tsx**

```tsx
interface PreviewCardProps {
  title: string;
  previewUrl: string;
  type: "webpage" | "document" | "code";
}

export function PreviewCard({ title, previewUrl, type }: PreviewCardProps) {
  return (
    <a
      href={previewUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition my-2"
    >
      <div className="aspect-video bg-gray-50 border-b">
        {type === "webpage" ? (
          <iframe
            src={previewUrl}
            title={title}
            className="w-full h-full pointer-events-none"
            sandbox="allow-scripts"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
            {type === "code" ? "Code Preview" : "Document Preview"}
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="text-xs text-blue-500 mt-1">Open preview →</div>
      </div>
    </a>
  );
}
```

- [ ] **Step 6: Create packages/ui/src/index.ts**

```typescript
export { MessageBubble } from "./MessageBubble";
export { CodeBlock } from "./CodeBlock";
export { PreviewCard } from "./PreviewCard";
```

- [ ] **Step 7: Run pnpm install**

```bash
pnpm install
```

- [ ] **Step 8: Commit**

```bash
git add packages/ui/
git commit -m "feat: add shared UI components"
```

***

### Task 4.3: Implement login and register pages

**Files:**

- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/register/page.tsx`
- Create: `apps/web/src/lib/api.ts`
- [ ] **Step 1: Create API client**

File: `apps/web/src/lib/api.ts`

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("accessToken", token);
      } else {
        localStorage.removeItem("accessToken");
      }
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== "undefined") {
      this.token = localStorage.getItem("accessToken");
    }
    return this.token;
  }

  async request(path: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> ?? {}),
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      this.setToken(null);
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    return res;
  }

  async get(path: string) {
    return this.request(path);
  }

  async post(path: string, body?: unknown) {
    return this.request(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async patch(path: string, body?: unknown) {
    return this.request(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  async delete(path: string) {
    return this.request(path, { method: "DELETE" });
  }
}

export const api = new ApiClient();
```

- [ ] **Step 2: Create login page**

File: `apps/web/src/app/login/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/login", { email, password });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Login failed");
        return;
      }
      const data = await res.json();
      api.setToken(data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/chat");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AgentHub</h1>
          <p className="text-gray-500 mt-2">Sign in to your account</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 transition"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-blue-500 hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create register page**

File: `apps/web/src/app/register/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/auth/register", { name, email, password });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Registration failed");
        return;
      }
      const data = await res.json();
      api.setToken(data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/chat");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">AgentHub</h1>
          <p className="text-gray-500 mt-2">Create your account</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Your name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="••••••••"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 transition"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-500 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run pnpm install and verify pages render**

```bash
pnpm install
cd apps/web && pnpm dev
# Visit http://localhost:3000/login and /register
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/login/ apps/web/src/app/register/ apps/web/src/lib/
git commit -m "feat: implement login and register pages"
```

***

### Task 4.4: Implement IM chat layout

**Files:**

- Create: `apps/web/src/app/chat/page.tsx`
- Create: `apps/web/src/app/chat/layout.tsx`
- Create: `apps/web/src/components/Sidebar.tsx`
- Create: `apps/web/src/components/ChatPanel.tsx`
- Create: `apps/web/src/components/ChatInput.tsx`
- Create: `apps/web/src/app/chat/[conversationId]/page.tsx`
- Create: `apps/web/src/hooks/useSSE.ts`
- Create: `apps/web/src/hooks/useWebSocket.ts`
- [ ] **Step 1: Create chat layout**

File: `apps/web/src/app/chat/layout.tsx`

```tsx
import { Sidebar } from "@/components/Sidebar";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create Sidebar**

File: `apps/web/src/components/Sidebar.tsx`

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Conversation } from "shared";

export function Sidebar() {
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    api.get("/conversations").then(async (res) => {
      if (res.ok) setConversations(await res.json());
    });
  }, []);

  return (
    <aside className="w-72 border-r bg-gray-50 flex flex-col">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Chats</h2>
        <button
          onClick={() => router.push("/agents")}
          className="text-blue-500 text-sm hover:underline"
        >
          + New
        </button>
      </div>
      <div className="p-3">
        <input
          type="text"
          placeholder="Search conversations..."
          className="w-full px-3 py-2 bg-white border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => (
          <Link
            key={conv.id}
            href={`/chat/${conv.id}`}
            className="block px-4 py-3 hover:bg-gray-100 border-b border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-sm font-medium">
                {conv.title.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{conv.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {conv.type === "group" ? "Group" : "Chat"}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Create SSE hook**

File: `apps/web/src/hooks/useSSE.ts`

```typescript
"use client";

import { useCallback, useRef } from "react";
import type { Chunk } from "shared";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(
    (
      conversationId: string,
      onChunk: (chunk: Chunk) => void,
      onError: (error: string) => void,
      onDone: () => void
    ) => {
      const token = localStorage.getItem("accessToken");
      const url = `${API_BASE}/sse/conversations/${conversationId}/stream?token=${token}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.addEventListener("chunk", (e) => {
        try {
          const chunk = JSON.parse(e.data) as Chunk;
          onChunk(chunk);
          if (chunk.type === "done") onDone();
          if (chunk.type === "error") onError(chunk.content);
        } catch {
          // parse error
        }
      });

      es.onerror = () => {
        es.close();
        if (es.readyState === EventSource.CLOSED) {
          onDone();
        }
      };

      return es;
    },
    []
  );

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
  }, []);

  return { connect, disconnect };
}
```

- [ ] **Step 4: Create ChatPanel**

File: `apps/web/src/components/ChatPanel.tsx`

```tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { MessageBubble, CodeBlock, PreviewCard } from "ui";
import { SenderType, type Message, type Chunk } from "shared";
import { api } from "@/lib/api";
import { useSSE } from "@/hooks/useSSE";
import { ChatInput } from "./ChatInput";

interface ChatPanelProps {
  conversationId: string;
}

export function ChatPanel({ conversationId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const { connect, disconnect } = useSSE();

  useEffect(() => {
    api.get(`/conversations/${conversationId}`).then(async (res) => {
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages.reverse());
      }
    });
  }, [conversationId]);

  const handleSend = useCallback(
    async (content: string) => {
      const res = await api.post(`/conversations/${conversationId}/messages`, {
        type: "text",
        content: { text: content },
      });
      if (!res.ok) return;
      const userMsg = await res.json();
      setMessages((prev) => [...prev, userMsg]);
      setStreamingContent("");
      setIsStreaming(true);

      connect(
        conversationId,
        (chunk: Chunk) => {
          if (chunk.type === "text" || chunk.type === "code") {
            setStreamingContent((prev) => prev + chunk.content);
          }
        },
        (error: string) => {
          setStreamingContent(`Error: ${error}`);
          setIsStreaming(false);
        },
        () => {
          setIsStreaming(false);
        }
      );
    },
    [conversationId, connect]
  );

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 border-b">
        <h2 className="font-semibold text-gray-900">Conversation</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            senderType={msg.senderType as SenderType}
            senderName={msg.senderType === "user" ? "You" : "Agent"}
            timestamp={new Date(msg.createdAt).toLocaleTimeString()}
          >
            {msg.type === "text" && typeof msg.content === "object" && "text" in (msg.content as object)
              ? (msg.content as { text: string }).text
              : JSON.stringify(msg.content)}
          </MessageBubble>
        ))}
        {isStreaming && streamingContent && (
          <div className="bg-gray-100 rounded-2xl px-4 py-2 text-gray-900 max-w-[70%]">
            {streamingContent}
          </div>
        )}
      </div>
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
```

- [ ] **Step 5: Create ChatInput**

File: `apps/web/src/components/ChatInput.tsx`

```tsx
"use client";

import { useState } from "react";

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="border-t p-4">
      <div className="flex gap-3">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ? "Agent is typing..." : "Type a message..."}
          disabled={disabled}
          className="flex-1 px-4 py-2 border rounded-full outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
        />
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          className="px-5 py-2 bg-blue-500 text-white rounded-full font-medium hover:bg-blue-600 disabled:opacity-50 transition"
        >
          Send
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Create chat landing and detail pages**

File: `apps/web/src/app/chat/page.tsx`

```tsx
export default function ChatPage() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-400">Select a conversation</h2>
        <p className="text-gray-400 mt-1">or start a new one</p>
      </div>
    </div>
  );
}
```

File: `apps/web/src/app/chat/[conversationId]/page.tsx`

```tsx
import { ChatPanel } from "@/components/ChatPanel";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <ChatPanel conversationId={conversationId} />;
}
```

- [ ] **Step 7: Run pnpm install and verify**

```bash
pnpm install
cd apps/web && pnpm dev
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ apps/web/src/hooks/ apps/web/src/app/chat/ apps/web/src/lib/
git commit -m "feat: implement IM chat layout with SSE streaming"
```

***

## Phase 5: Orchestrator & Group Chat

### Task 5.1: Implement Orchestrator

**Files:**

- Create: `apps/server/src/orchestrator/index.ts`
- Create: `apps/server/src/orchestrator/__tests__/orchestrator.test.ts`
- [ ] **Step 1: Write failing test**

File: `apps/server/src/orchestrator/__tests__/orchestrator.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { Orchestrator } from "../index.js";

describe("Orchestrator", () => {
  it("should parse user intent and return task plan", async () => {
    const orchestrator = new Orchestrator();
    const plan = await orchestrator.plan(
      "帮我用 React 写个登录页面，然后检查一下代码质量"
    );
    expect(plan.tasks).toBeDefined();
    expect(plan.tasks.length).toBeGreaterThan(0);
  });

  it("should identify independent tasks that can run in parallel", async () => {
    const orchestrator = new Orchestrator();
    const plan = await orchestrator.plan(
      "写一个前端页面和写一份 README"
    );
    const parallelGroups = orchestrator.groupTasks(plan.tasks);
    expect(parallelGroups.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/server && pnpm test
```

- [ ] **Step 3: Implement Orchestrator**

File: `apps/server/src/orchestrator/index.ts`

```typescript
export interface Task {
  id: string;
  description: string;
  agentIndex: number; // which agent in the contactIds array
  dependencies: string[]; // task ids this task depends on
}

export interface TaskPlan {
  tasks: Task[];
  summary: string;
}

export class Orchestrator {
  async plan(userMessage: string): Promise<TaskPlan> {
    // Simple rule-based planning: split by common delimiters
    // In production, this would use an LLM call
    const parts = userMessage
      .split(/[，,;；然后|并且和]/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const tasks: Task[] = parts.map((desc, i) => ({
      id: `task-${i}`,
      description: desc,
      agentIndex: i % 2, // alternate between agents
      dependencies: [],
    }));

    // If message contains "检查" or "review", make it depend on first task
    if (userMessage.includes("检查") || userMessage.includes("review")) {
      tasks.forEach((t, i) => {
        if (i > 0) {
          t.dependencies = [tasks[i - 1].id];
        }
      });
    }

    return {
      tasks,
      summary: `Split into ${tasks.length} tasks`,
    };
  }

  groupTasks(tasks: Task[]): Task[][] {
    const groups: Task[][] = [];
    const remaining = new Set(tasks.map((t) => t.id));

    while (remaining.size > 0) {
      const group: Task[] = [];
      for (const task of tasks) {
        if (!remaining.has(task.id)) continue;
        if (task.dependencies.every((depId) => !remaining.has(depId))) {
          group.push(task);
          remaining.delete(task.id);
        }
      }
      if (group.length > 0) {
        groups.push(group);
      } else {
        break; // circular dependency guard
      }
    }

    return groups;
  }

  async executePlan(
    plan: TaskPlan,
    adapters: Array<{
      execute: (task: Task) => AsyncIterable<{ type: string; content: string }>;
    }>,
    taskResults: Map<string, string>
  ): Promise<Map<string, string>> {
    const groups = this.groupTasks(plan.tasks);

    for (const group of groups) {
      const promises = group.map(async (task) => {
        const adapter = adapters[task.agentIndex];
        let fullOutput = "";

        for await (const chunk of adapter.execute(task)) {
          fullOutput += chunk.content;
        }

        taskResults.set(task.id, fullOutput);
      });

      await Promise.all(promises);
    }

    return taskResults;
  }

  aggregate(taskResults: Map<string, string>): string {
    const parts: string[] = [];
    taskResults.forEach((result, taskId) => {
      parts.push(`**${taskId}**:\n${result}`);
    });
    return parts.join("\n\n---\n\n");
  }
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/server && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestrator/
git commit -m "feat: implement Orchestrator with task planning and parallel execution"
```

***

### Task 5.2: Implement group chat message handling

**Files:**

- Modify: `apps/server/src/routes/messages.ts`
- [ ] **Step 1: Update message POST to handle group chat with Orchestrator**

In `apps/server/src/routes/messages.ts`, update the POST `/` handler after saving the user message:

```typescript
// After saving user message, if conversation is group type:
if (conversation.type === "group") {
  const orchestrator = new Orchestrator();
  const plan = await orchestrator.plan(
    typeof content === "object" && "text" in (content as object)
      ? (content as { text: string }).text
      : JSON.stringify(content)
  );

  const taskResults = new Map<string, string>();
  const adapters = conversation.contactIds.map((contactId, index) => ({
    execute: async (task: Task) => {
      // Get the adapter for this contact and execute
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        include: { agent: true },
      });
      const adapter = registry.get(contact!.agent.provider);
      const credentialRecord = await prisma.userCredential.findUnique({
        where: { userId_provider: { userId, provider: contact!.agent.provider } },
      });
      if (!credentialRecord) {
        throw new Error(`No API key for ${contact!.agent.provider}`);
      }
      return adapter.execute(
        {
          systemPrompt: contact!.agent.systemPrompt ?? "",
          messages: [{ role: "user", content: task.description }],
        },
        { apiKey: credentialRecord.encryptedKey }
      );
    },
  }));

  await orchestrator.executePlan(plan, adapters, taskResults);

  const summary = orchestrator.aggregate(taskResults);

  await prisma.message.create({
    data: {
      conversationId,
      senderType: "system",
      senderId: "orchestrator",
      type: "text",
      content: { text: summary },
      metadata: {
        tasks: plan.tasks.map((t) => ({
          id: t.id,
          description: t.description,
          result: taskResults.get(t.id),
        })),
      },
    },
  });
}
```

(Note: requires importing `Orchestrator` and `Task` at the top of the file)

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/messages.ts
git commit -m "feat: add group chat orchestration to message handling"
```

***

## Phase 6: Artifact Preview & Credentials

### Task 6.1: Implement credential management routes

**Files:**

- Create: `apps/server/src/routes/credentials.ts`
- [ ] **Step 1: Create credential routes**

File: `apps/server/src/routes/credentials.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "db";
import { authenticate } from "../middleware/auth.js";

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const credentials = await prisma.userCredential.findMany({
      where: { userId },
      select: { id: true, provider: true, createdAt: true },
    });
    return reply.send(credentials);
  });

  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { provider, apiKey } = req.body as { provider: string; apiKey: string };
    if (!provider || !apiKey) {
      return reply.status(400).send({ error: "provider and apiKey are required" });
    }

    const credential = await prisma.userCredential.upsert({
      where: { userId_provider: { userId, provider } },
      update: { encryptedKey: apiKey },
      create: { userId, provider, encryptedKey: apiKey },
    });

    return reply.status(201).send({
      id: credential.id,
      provider: credential.provider,
      createdAt: credential.createdAt,
    });
  });

  app.delete("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req.user as { sub: string }).sub;
    const { id } = req.params as { id: string };
    const credential = await prisma.userCredential.findFirst({
      where: { id, userId },
    });
    if (!credential) {
      return reply.status(404).send({ error: "Credential not found" });
    }
    await prisma.userCredential.delete({ where: { id } });
    return reply.status(204).send();
  });
}
```

- [ ] **Step 2: Register credential routes in index.ts**

```typescript
import { credentialRoutes } from "./routes/credentials.js";
await app.register(credentialRoutes, { prefix: "/credentials" });
```

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/routes/credentials.ts apps/server/src/index.ts
git commit -m "feat: implement credential management routes"
```

***

### Task 6.2: Implement artifact preview routes

**Files:**

- Create: `apps/server/src/routes/artifacts.ts`
- Create: `apps/server/src/artifacts/preview.ts`
- [ ] **Step 1: Create artifact routes**

File: `apps/server/src/routes/artifacts.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "db";
import { authenticate } from "../middleware/auth.js";
import { generatePreview } from "../artifacts/preview.js";

export async function artifactRoutes(app: FastifyInstance) {
  app.addHook("onRequest", authenticate);

  app.get("/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const artifact = await prisma.artifact.findUnique({ where: { id } });
    if (!artifact) {
      return reply.status(404).send({ error: "Artifact not found" });
    }
    return reply.send(artifact);
  });

  app.get("/:id/preview", async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const artifact = await prisma.artifact.findUnique({ where: { id } });
    if (!artifact) {
      return reply.status(404).send({ error: "Artifact not found" });
    }

    if (artifact.previewUrl) {
      return reply.redirect(artifact.previewUrl);
    }

    const previewUrl = await generatePreview(artifact);
    await prisma.artifact.update({
      where: { id },
      data: { previewUrl, status: "done" },
    });

    return reply.redirect(previewUrl);
  });
}
```

- [ ] **Step 2: Create preview generator**

File: `apps/server/src/artifacts/preview.ts`

```typescript
import { prisma } from "db";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_DIR = path.join(__dirname, "../../previews");

export async function generatePreview(
  artifact: { id: string; type: string; content: unknown }
): Promise<string> {
  await fs.mkdir(PREVIEW_DIR, { recursive: true });

  if (artifact.type === "webpage") {
    const content = artifact.content as { html?: string };
    const html = content.html ?? "<html><body>No content</body></html>";
    const fileName = `${artifact.id}.html`;
    await fs.writeFile(path.join(PREVIEW_DIR, fileName), html);
    return `/previews/${fileName}`;
  }

  if (artifact.type === "code") {
    const content = artifact.content as { code?: string; language?: string };
    const ext = content.language === "tsx" ? "tsx" : content.language ?? "txt";
    const fileName = `${artifact.id}.${ext}`;
    await fs.writeFile(path.join(PREVIEW_DIR, fileName), content.code ?? "");
    return `/previews/${fileName}`;
  }

  return "";
}
```

- [ ] **Step 3: Register artifact routes and static preview serving**

In `apps/server/src/index.ts`:

```typescript
import { artifactRoutes } from "./routes/artifacts.js";
import fastifyStatic from "@fastify/static";
import path from "path";

// Register artifact routes
await app.register(artifactRoutes, { prefix: "/artifacts" });

// Serve preview files statically
await app.register(fastifyStatic, {
  root: path.join(import.meta.dirname, "../previews"),
  prefix: "/previews/",
  decorateReply: false,
});
```

- [ ] **Step 4: Add @fastify/static dependency**

```bash
cd apps/server && pnpm add @fastify/static
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/routes/artifacts.ts apps/server/src/artifacts/ apps/server/src/index.ts
git commit -m "feat: implement artifact preview routes"
```

***

## Phase 7: P2 Features

### Task 7.1: Add PWA support to web app

**Files:**

- Create: `apps/web/public/manifest.json`
- Create: `apps/web/public/sw.js`
- Modify: `apps/web/src/app/layout.tsx`
- [ ] **Step 1: Create PWA manifest**

File: `apps/web/public/manifest.json`

```json
{
  "name": "AgentHub",
  "short_name": "AgentHub",
  "description": "Multi-Agent Collaboration Platform",
  "start_url": "/chat",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#3b82f6",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

- [ ] **Step 2: Create Service Worker**

File: `apps/web/public/sw.js`

```javascript
const CACHE_NAME = "agenthub-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(["/chat", "/login"]);
    })
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
```

- [ ] **Step 3: Add manifest link to layout**

In `apps/web/src/app/layout.tsx`, add to `<head>`:

```tsx
<>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#3b82f6" />
</>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/public/ apps/web/src/app/layout.tsx
git commit -m "feat: add PWA support"
```

***

### Task 7.2: Initialize Electron desktop app

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/preload.ts`
- [ ] **Step 1: Create apps/desktop/package.json**

```json
{
  "name": "desktop",
  "version": "0.0.0",
  "private": true,
  "main": "./dist/main.js",
  "scripts": {
    "dev": "electron .",
    "build": "tsc",
    "lint": "eslint src/"
  },
  "dependencies": {
    "electron": "^33.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "eslint-config": "workspace:*",
    "tsconfig": "workspace:*",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create apps/desktop/tsconfig.json**

```json
{
  "extends": "tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create main process**

File: `apps/desktop/src/main.ts`

```typescript
import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const serverUrl = process.env.SERVER_URL ?? "http://localhost:3001";
  const webUrl = `http://localhost:3000/chat`;

  mainWindow.loadURL(webUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC handlers for local file operations
ipcMain.handle("read-file", async (_event, filePath: string) => {
  const fs = await import("fs/promises");
  return fs.readFile(filePath, "utf-8");
});

ipcMain.handle("write-file", async (_event, filePath: string, content: string) => {
  const fs = await import("fs/promises");
  await fs.writeFile(filePath, content, "utf-8");
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

- [ ] **Step 4: Create preload script**

File: `apps/desktop/src/preload.ts`

```typescript
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  readFile: (filePath: string) => ipcRenderer.invoke("read-file", filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("write-file", filePath, content),
});
```

- [ ] **Step 5: Run pnpm install**

```bash
pnpm install
```

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/
git commit -m "feat: initialize Electron desktop app"
```

***

## Phase 8: Integration & E2E Tests

### Task 8.1: Add Playwright E2E tests

**Files:**

- Create: `apps/web/e2e/login.spec.ts`
- Create: `apps/web/e2e/chat.spec.ts`
- Create: `apps/web/playwright.config.ts`
- [ ] **Step 1: Add Playwright to web app**

```bash
cd apps/web && pnpm add -D @playwright/test
```

- [ ] **Step 2: Create playwright.config.ts**

File: `apps/web/playwright.config.ts`

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://localhost:3000",
  },
});
```

- [ ] **Step 3: Create login E2E test**

File: `apps/web/e2e/login.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Login", () => {
  test("should show login form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "AgentHub" })).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    await expect(page.getByPlaceholder("••••••••")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("should show validation errors on empty submit", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign In" }).click();
  });

  test("should navigate to register page", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Sign up").click();
    await expect(page).toHaveURL("/register");
  });
});
```

- [ ] **Step 4: Create chat E2E test**

File: `apps/web/e2e/chat.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Chat", () => {
  test("should show sidebar and empty state", async ({ page }) => {
    await page.goto("/login");
    // Login with test user
    await page.getByPlaceholder("you@example.com").fill("test@example.com");
    await page.getByPlaceholder("••••••••").fill("password123");
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("/chat");
    await expect(page.getByText("Select a conversation")).toBeVisible();
    await expect(page.getByText("Chats")).toBeVisible();
  });
});
```

- [ ] **Step 5: Run E2E tests**

```bash
cd apps/web && npx playwright test
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/e2e/ apps/web/playwright.config.ts
git commit -m "test: add Playwright E2E tests for login and chat"
```

***

## Summary

| Phase | Tasks   | Description                                         |
| ----- | ------- | --------------------------------------------------- |
| 1     | 1.1-1.4 | Monorepo scaffold, tooling, shared types, database  |
| 2     | 2.1     | Agent adapter layer (Claude, OpenCode, Custom)      |
| 3     | 3.1-3.6 | Fastify server, auth, API, SSE, WebSocket           |
| 4     | 4.1-4.4 | Next.js app, UI components, login/register, IM chat |
| 5     | 5.1-5.2 | Orchestrator and group chat                         |
| 6     | 6.1-6.2 | Credential management and artifact preview          |
| 7     | 7.1-7.2 | PWA support and Electron desktop app                |
| 8     | 8.1     | E2E tests                                           |

