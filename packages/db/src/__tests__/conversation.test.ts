import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
} from "../repositories/conversation";

describe("Conversation Repository", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        name: "[TEST] Conv User",
        email: `conv-test-${Date.now()}@test.dev`,
        passwordHash: "hash",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("should create a conversation", async () => {
    const conv = await createConversation(
      {
        title: "[TEST] My Conversation",
        type: "single",
        ownerId: userId,
      },
      prisma
    );

    expect(conv.id).toBeDefined();
    expect(conv.title).toBe("[TEST] My Conversation");
    expect(conv.type).toBe("single");
    expect(conv.isArchived).toBe(false);
  });

  it("should get a conversation with messages", async () => {
    const created = await createConversation(
      { title: "[TEST] Get Conversation", type: "group", ownerId: userId },
      prisma
    );

    const conv = await getConversation(created.id, prisma);
    expect(conv).not.toBeNull();
    expect(conv!.title).toBe("[TEST] Get Conversation");
    expect(conv!.messages).toBeDefined();
  });

  it("should list conversations for a user", async () => {
    await createConversation(
      { title: "[TEST] List 1", type: "single", ownerId: userId },
      prisma
    );
    await createConversation(
      { title: "[TEST] List 2", type: "group", ownerId: userId },
      prisma
    );

    const result = await listConversations(
      userId,
      { offset: 0, limit: 20 },
      prisma
    );
    const testConvs = result.data.filter((c) =>
      c.title.startsWith("[TEST]")
    );
    expect(testConvs.length).toBeGreaterThanOrEqual(2);
    expect(result.total).toBeGreaterThanOrEqual(2);
  });

  it("should exclude archived by default", async () => {
    const archived = await createConversation(
      { title: "[TEST] Archived", type: "single", ownerId: userId },
      prisma
    );
    await updateConversation(archived.id, { isArchived: true }, prisma);

    const result = await listConversations(userId, {}, prisma);
    const archivedInList = result.data.find((c) => c.id === archived.id);
    expect(archivedInList).toBeUndefined();

    const resultWithArchived = await listConversations(
      userId,
      { includeArchived: true },
      prisma
    );
    const found = resultWithArchived.data.find((c) => c.id === archived.id);
    expect(found).toBeDefined();
    expect(found!.isArchived).toBe(true);
  });

  it("should update a conversation", async () => {
    const conv = await createConversation(
      { title: "[TEST] Before Update", type: "single", ownerId: userId },
      prisma
    );

    const updated = await updateConversation(
      conv.id,
      { title: "[TEST] After Update" },
      prisma
    );
    expect(updated.title).toBe("[TEST] After Update");
  });
});
