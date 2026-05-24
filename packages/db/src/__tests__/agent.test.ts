import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TEST_DATABASE_URL } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createAgent,
  getAgent,
  listAgents,
  updateAgent,
  deleteAgent,
} from "../repositories/agent";

describe("Agent Repository", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.agent.deleteMany({
      where: { name: { startsWith: "[TEST]" } },
    });
  });

  it("should create an agent", async () => {
    const agent = await createAgent(
      {
        name: "[TEST] Claude Agent",
        provider: "Claude",
        systemPrompt: "You are helpful",
        model: "claude-sonnet-4-6",
      },
      prisma
    );

    expect(agent.id).toBeDefined();
    expect(agent.name).toBe("[TEST] Claude Agent");
    expect(agent.provider).toBe("Claude");
    expect(agent.model).toBe("claude-sonnet-4-6");
  });

  it("should get an agent by id", async () => {
    const created = await createAgent(
      { name: "[TEST] Get Agent", provider: "OpenCode" },
      prisma
    );

    const agent = await getAgent(created.id, prisma);
    expect(agent).not.toBeNull();
    expect(agent!.name).toBe("[TEST] Get Agent");
  });

  it("should list all agents", async () => {
    await createAgent({ name: "[TEST] Agent A", provider: "Claude" }, prisma);
    await createAgent({ name: "[TEST] Agent B", provider: "OpenCode" }, prisma);

    const agents = await listAgents({}, prisma);
    const testAgents = agents.filter((a) => a.name.startsWith("[TEST]"));
    expect(testAgents.length).toBeGreaterThanOrEqual(2);
  });

  it("should filter agents by provider", async () => {
    await createAgent({ name: "[TEST] Claude Only", provider: "Claude" }, prisma);
    await createAgent(
      { name: "[TEST] OpenCode Only", provider: "OpenCode" },
      prisma
    );

    const claudeAgents = await listAgents({ provider: "Claude" }, prisma);
    const testClaude = claudeAgents.filter((a) =>
      a.name.startsWith("[TEST]")
    );
    expect(testClaude.every((a) => a.provider === "Claude")).toBe(true);
  });

  it("should update an agent", async () => {
    const created = await createAgent(
      { name: "[TEST] Before Update", provider: "Custom" },
      prisma
    );

    const updated = await updateAgent(
      created.id,
      { name: "[TEST] After Update", model: "gpt-4" },
      prisma
    );
    expect(updated.name).toBe("[TEST] After Update");
    expect(updated.model).toBe("gpt-4");
  });

  it("should delete an agent", async () => {
    const created = await createAgent(
      { name: "[TEST] To Delete", provider: "Claude" },
      prisma
    );

    await deleteAgent(created.id, prisma);
    const agent = await getAgent(created.id, prisma);
    expect(agent).toBeNull();
  });
});
