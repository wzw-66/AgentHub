import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Database as DatabaseType } from "better-sqlite3";
import { createTestDb, destroyTestDb } from "./setup.js";
import { extractMemories } from "../extractor.js";
import { createMemory, getMemory, listMemories } from "../repository.js";
import { searchMemories } from "../search.js";

let db: DatabaseType;

const MOCK_PARAMS = {
  userId: "user-extract",
  agentId: "agent-extract",
  agentName: "TestBot",
  userMessage: "I prefer using tabs over spaces for indentation",
  agentResponse: "Got it! I'll use tabs when writing code for you.",
};

beforeAll(() => {
  db = createTestDb();
});

afterAll(() => {
  destroyTestDb(db);
});

describe("extractMemories", () => {
  it("calls LLM and persists extracted memories", async () => {
    // Mock fetch to return a simulated LLM response
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  action: "add",
                  type: "preference",
                  content: "User prefers tabs over spaces for indentation",
                  importance: 8,
                  reason: "User explicitly stated tab preference",
                },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, {
      apiKey: "test-key",
      endpoint: "https://fake-api.test/v1/chat/completions",
      model: "test-model",
    }, db);

    // Verify the fetch was called
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify the memory was persisted
    const results = searchMemories({ query: "tabs", userId: "user-extract", agentId: "agent-extract" }, db);
    expect(results.length).toBe(1);
    expect(results[0]!.content).toContain("tabs");
    expect(results[0]!.type).toBe("preference");

    vi.unstubAllGlobals();
  });

  it("handles deletion operations from LLM output", async () => {
    // First, create a memory we'll "delete"
    const created = createMemory({
      userId: "user-extract",
      agentId: "agent-extract",
      type: "fact",
      content: "Old fact to be removed",
    }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                {
                  action: "delete",
                  id: created.id,
                  reason: "This fact is no longer relevant",
                },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, {
      apiKey: "test-key",
      endpoint: "https://fake-api.test/v1/chat/completions",
    }, db);

    // Verify the memory was deleted
    expect(getMemory(created.id, db)).toBeNull();

    vi.unstubAllGlobals();
  });

  it("handles update operation from LLM output", async () => {
    // First, create a memory to be updated
    const created = createMemory({
      userId: "user-extract",
      agentId: "agent-extract",
      type: "fact",
      content: "Old content to update",
      importance: 3,
    }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([{
              action: "update",
              id: created.id,
              type: "preference",
              content: "Updated content with new preference",
              importance: 7,
              reason: "User preference changed",
            }]),
          },
        }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db);

    // Verify the old memory is gone
    expect(getMemory(created.id, db)).toBeNull();

    // Verify the new memory exists with updated content
    const updatedResults = searchMemories({ query: "Updated content", userId: "user-extract", agentId: "agent-extract" }, db);
    expect(updatedResults.length).toBe(1);
    expect(updatedResults[0]!.content).toBe("Updated content with new preference");
    expect(updatedResults[0]!.type).toBe("preference");
    expect(updatedResults[0]!.importance).toBe(7);

    vi.unstubAllGlobals();
  });

  it("handles LLM API failure gracefully (no throw)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Rate Limited",
    });
    vi.stubGlobal("fetch", mockFetch);

    // Should not throw — extraction is non-blocking
    await expect(
      extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db),
    ).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("handles invalid JSON response gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "This is not valid JSON at all" } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(
      extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db),
    ).resolves.toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("handles 'noop' action without side effects", async () => {
    const before = listMemories({ userId: "user-extract" }, db);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify([
                { action: "noop", reason: "Nothing new to remember" },
              ]),
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await extractMemories(MOCK_PARAMS, { apiKey: "test-key" }, db);

    const after = listMemories({ userId: "user-extract" }, db);
    expect(after.data.length).toBe(before.data.length);

    vi.unstubAllGlobals();
  });
});
