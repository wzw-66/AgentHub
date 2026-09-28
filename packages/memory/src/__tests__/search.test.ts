import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { searchMemories } from "../search.js";

let db: DatabaseType;

beforeAll(() => {
  db = createTestDb();
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "fact",
    content: "The API endpoint is at https://api.example.com/v1",
    tags: ["api", "endpoint"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "preference",
    content: "User prefers camelCase naming convention",
    tags: ["naming", "style"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-other",
    type: "decision",
    content: "Decided to use Prisma ORM for database access",
    tags: ["architecture", "database"],
  }, db);
  createMemory({
    userId: "user-search",
    conversationId: "conv-search",
    agentId: "agent-search",
    type: "context",
    content: "Project root is /home/user/projects/agenthub",
    tags: ["project", "path"],
  }, db);
});

afterAll(() => {
  destroyTestDb(db);
});

const SCOPE = { conversationId: "conv-search" } as const;

describe("searchMemories", () => {
  it("finds memories matching the FTS query", () => {
    const results = searchMemories({ query: "API", userId: "user-search", scope: SCOPE, limit: 10 }, db);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.content.includes("api.example.com"))).toBe(true);
  });

  it("filters by agentId when provided", () => {
    const results = searchMemories(
      { query: "endpoint", userId: "user-search", scope: SCOPE, agentId: "agent-search" },
      db,
    );
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("API endpoint");
  });

  it("returns empty array when no match", () => {
    const results = searchMemories({ query: "zzzznonexistent", userId: "user-search", scope: SCOPE, limit: 10 }, db);
    expect(results.length).toBe(0);
  });

  it("respects limit", () => {
    const results = searchMemories({ query: "the", userId: "user-search", scope: SCOPE, limit: 1 }, db);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns memories from all conversations when scope is allConversations", () => {
    createMemory({
      userId: "user-search",
      conversationId: "conv-other",
      agentId: "agent-search",
      type: "fact",
      content: "Zebra crossing fact only in another conversation",
    }, db);

    const scoped = searchMemories({ query: "Zebra", userId: "user-search", scope: SCOPE }, db);
    expect(scoped.length).toBe(0);

    const global = searchMemories(
      { query: "Zebra", userId: "user-search", scope: { allConversations: true } },
      db,
    );
    expect(global.length).toBe(1);
  });

  it("excludes memories from another conversation with a contradictory value", () => {
    createMemory({
      userId: "user-search",
      conversationId: "conv-project-b",
      agentId: "agent-search",
      type: "preference",
      content: "Indentation should use two spaces",
    }, db);
    createMemory({
      userId: "user-search",
      conversationId: "conv-project-a",
      agentId: "agent-search",
      type: "preference",
      content: "Indentation should use a tab character",
    }, db);

    const a = searchMemories(
      { query: "Indentation", userId: "user-search", scope: { conversationId: "conv-project-a" } },
      db,
    );
    expect(a.length).toBe(1);
    expect(a[0]!.content).toContain("tab");

    const b = searchMemories(
      { query: "Indentation", userId: "user-search", scope: { conversationId: "conv-project-b" } },
      db,
    );
    expect(b.length).toBe(1);
    expect(b[0]!.content).toContain("two spaces");
  });

  it("excludes memories whose user_id does not match, even in the same conversation", () => {
    createMemory({
      userId: "user-other",
      conversationId: "conv-shared",
      agentId: "agent-search",
      type: "fact",
      content: "Ostrich secret belonging to another user",
    }, db);
    createMemory({
      userId: "user-search",
      conversationId: "conv-shared",
      agentId: "agent-search",
      type: "fact",
      content: "Ostrich fact belonging to the current user",
    }, db);

    const results = searchMemories(
      { query: "Ostrich", userId: "user-search", scope: { conversationId: "conv-shared" } },
      db,
    );
    expect(results.length).toBe(1);
    expect(results[0]!.userId).toBe("user-search");
  });
});
