import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createPublishedAgent,
  getPublishedAgent,
  listPublishedAgents,
  updatePublishedAgent,
  deletePublishedAgent,
  incrementImportCount,
  listMyPublishedAgents,
} from "../repositories/market";

describe("Market Repository (PublishedAgent)", () => {
  let prisma: PrismaClient;
  let testUserId: string;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
    // Create a test user
    const user = await prisma.user.create({
      data: {
        name: "[TEST] Market User",
        email: `market-test-${Date.now()}@test.dev`,
        passwordHash: "hash",
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test user
    await prisma.user.deleteMany({ where: { name: "[TEST] Market User" } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.publishedAgent.deleteMany({
      where: { name: { startsWith: "[TEST]" } },
    });
  });

  it("should create a published agent", async () => {
    const published = await createPublishedAgent(
      {
        name: "[TEST] My Agent",
        provider: "Custom",
        description: "A test agent",
        systemPrompt: "You are helpful",
        model: "gpt-4",
        tags: ["test", "demo"],
        creatorId: testUserId,
      },
      prisma
    );

    expect(published.id).toBeDefined();
    expect(published.name).toBe("[TEST] My Agent");
    expect(published.provider).toBe("Custom");
    expect(published.description).toBe("A test agent");
    expect(published.systemPrompt).toBe("You are helpful");
    expect(published.model).toBe("gpt-4");
    expect(published.tags).toEqual(["test", "demo"]);
    expect(published.importCount).toBe(0);
    expect(published.creatorId).toBe(testUserId);
  });

  it("should create a published agent with minimal fields", async () => {
    const published = await createPublishedAgent(
      {
        name: "[TEST] Minimal Agent",
        provider: "Claude",
        creatorId: testUserId,
      },
      prisma
    );

    expect(published.name).toBe("[TEST] Minimal Agent");
    expect(published.description).toBeNull();
    expect(published.tags).toEqual([]);
    expect(published.importCount).toBe(0);
  });

  it("should get a published agent by id", async () => {
    const created = await createPublishedAgent(
      { name: "[TEST] Get Agent", provider: "OpenCode", creatorId: testUserId },
      prisma
    );

    const found = await getPublishedAgent(created.id, prisma);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("[TEST] Get Agent");
  });

  it("should return null for non-existent published agent", async () => {
    const found = await getPublishedAgent("non-existent-id", prisma);
    expect(found).toBeNull();
  });

  it("should list all published agents ordered by import count", async () => {
    await createPublishedAgent(
      { name: "[TEST] Agent A", provider: "Custom", description: "Low imports", creatorId: testUserId },
      prisma
    );
    const agentB = await createPublishedAgent(
      { name: "[TEST] Agent B", provider: "Custom", description: "High imports", creatorId: testUserId },
      prisma
    );
    // Boost Agent B's import count
    await incrementImportCount(agentB.id, prisma);
    await incrementImportCount(agentB.id, prisma);

    const agents = await listPublishedAgents({}, prisma);
    const testAgents = agents.filter((a) => a.name.startsWith("[TEST]"));
    // Agent B (2 imports) should come before Agent A (0 imports)
    expect(testAgents[0].name).toBe("[TEST] Agent B");
    expect(testAgents[0].importCount).toBe(2);
  });

  it("should filter published agents by provider", async () => {
    await createPublishedAgent({ name: "[TEST] Claude Agent", provider: "Claude", creatorId: testUserId }, prisma);
    await createPublishedAgent({ name: "[TEST] Custom Agent", provider: "Custom", creatorId: testUserId }, prisma);

    const claudeAgents = await listPublishedAgents({ provider: "Claude" }, prisma);
    const testClaude = claudeAgents.filter((a) => a.name.startsWith("[TEST]"));
    expect(testClaude.length).toBeGreaterThanOrEqual(1);
    expect(testClaude.every((a) => a.provider === "Claude")).toBe(true);
  });

  it("should search published agents by name", async () => {
    await createPublishedAgent({ name: "[TEST] Writer Bot", provider: "Custom", creatorId: testUserId }, prisma);
    await createPublishedAgent({ name: "[TEST] Code Helper", provider: "Custom", creatorId: testUserId }, prisma);

    const results = await listPublishedAgents({ q: "Writer" }, prisma);
    const testResults = results.filter((a) => a.name.startsWith("[TEST]"));
    expect(testResults.length).toBeGreaterThanOrEqual(1);
    expect(testResults.every((a) => a.name.includes("Writer"))).toBe(true);
  });

  it("should list my published agents", async () => {
    await createPublishedAgent({ name: "[TEST] My Pub 1", provider: "Custom", creatorId: testUserId }, prisma);
    await createPublishedAgent({ name: "[TEST] My Pub 2", provider: "Custom", creatorId: testUserId }, prisma);

    const myListings = await listMyPublishedAgents(testUserId, prisma);
    const testListings = myListings.filter((a) => a.name.startsWith("[TEST]"));
    expect(testListings.length).toBeGreaterThanOrEqual(2);
  });

  it("should update a published agent", async () => {
    const created = await createPublishedAgent(
      { name: "[TEST] Update Agent", provider: "Custom", creatorId: testUserId },
      prisma
    );

    const updated = await updatePublishedAgent(
      created.id,
      { description: "Updated description", tags: ["updated"] },
      prisma
    );

    expect(updated.description).toBe("Updated description");
    expect(updated.tags).toEqual(["updated"]);
  });

  it("should increment import count", async () => {
    const created = await createPublishedAgent(
      { name: "[TEST] Count Agent", provider: "Custom", creatorId: testUserId },
      prisma
    );

    expect(created.importCount).toBe(0);

    await incrementImportCount(created.id, prisma);
    const afterOne = await getPublishedAgent(created.id, prisma);
    expect(afterOne!.importCount).toBe(1);

    await incrementImportCount(created.id, prisma);
    const afterTwo = await getPublishedAgent(created.id, prisma);
    expect(afterTwo!.importCount).toBe(2);
  });

  it("should delete a published agent", async () => {
    const created = await createPublishedAgent(
      { name: "[TEST] Delete Agent", provider: "Custom", creatorId: testUserId },
      prisma
    );

    await deletePublishedAgent(created.id, prisma);
    const found = await getPublishedAgent(created.id, prisma);
    expect(found).toBeNull();
  });
});
