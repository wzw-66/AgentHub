import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { createMemory } from "../repository.js";
import { searchMemories } from "../search.js";

let db: DatabaseType;

beforeAll(() => {
  db = createTestDb();
  // Seed test data for search
  createMemory({
    userId: "user-search",
    agentId: "agent-search",
    type: "fact",
    content: "The API endpoint is at https://api.example.com/v1",
    tags: ["api", "endpoint"],
  }, db);
  createMemory({
    userId: "user-search",
    agentId: "agent-search",
    type: "preference",
    content: "User prefers camelCase naming convention",
    tags: ["naming", "style"],
  }, db);
  createMemory({
    userId: "user-search",
    agentId: "agent-other",
    type: "decision",
    content: "Decided to use Prisma ORM for database access",
    tags: ["architecture", "database"],
  }, db);
  createMemory({
    userId: "user-search",
    agentId: "agent-search",
    type: "context",
    content: "Project root is /home/user/projects/agenthub",
    tags: ["project", "path"],
  }, db);
});

afterAll(() => {
  destroyTestDb(db);
});

describe("searchMemories", () => {
  it("finds memories matching the FTS query", () => {
    const results = searchMemories({ query: "API", limit: 10 }, db);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.content.includes("api.example.com"))).toBe(true);
  });

  it("filters by userId when provided", () => {
    const results = searchMemories({ query: "Prisma", userId: "user-search" }, db);
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("Prisma");
  });

  it("filters by agentId when provided", () => {
    const results = searchMemories({ query: "endpoint", agentId: "agent-search" }, db);
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("API endpoint");
  });

  it("returns empty array when no match", () => {
    const results = searchMemories({ query: "zzzznonexistent", limit: 10 }, db);
    expect(results.length).toBe(0);
  });

  it("respects limit", () => {
    const results = searchMemories({ query: "the", limit: 1 }, db);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
