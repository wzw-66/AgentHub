import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./setup";
import type { PrismaClient } from "@prisma/client";
import { ConversationType } from "@agenthub/shared";
import {
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
  findSingleConversationByAgentId,
  addConversationMembers,
  removeConversationMembers,
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

  /** 建一个 Contact 当作群聊成员 */
  async function createContact(name: string): Promise<string> {
    const contact = await prisma.contact.create({
      data: { userId, name, provider: "Custom" },
    });
    return contact.id;
  }

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

  it("should find the single conversation containing a given agent", async () => {
    const agentId = await createContact("[TEST] Agent A");
    const otherAgentId = await createContact("[TEST] Agent B");

    const target = await createConversation(
      { title: "[TEST] Single with A", type: ConversationType.Single, ownerId: userId, contactIds: [agentId] },
      prisma
    );
    await createConversation(
      { title: "[TEST] Single with B", type: ConversationType.Single, ownerId: userId, contactIds: [otherAgentId] },
      prisma
    );

    const found = await findSingleConversationByAgentId(userId, agentId, prisma);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(target.id);
  });

  it("should return null when no single conversation contains the agent", async () => {
    const lonelyAgentId = await createContact("[TEST] Agent C");
    const found = await findSingleConversationByAgentId(userId, lonelyAgentId, prisma);
    expect(found).toBeNull();
  });

  it("should add members without duplicating existing ones", async () => {
    const a = await createContact("[TEST] Agent D");
    const b = await createContact("[TEST] Agent E");

    const conv = await createConversation(
      { title: "[TEST] Add members", type: ConversationType.Group, ownerId: userId, contactIds: [a] },
      prisma
    );

    const afterAdd = await addConversationMembers(conv.id, [a, b], prisma);
    expect(afterAdd.contactIds).toEqual([a, b]);

    // 重复添加已存在的成员不应产生重复项
    const again = await addConversationMembers(conv.id, [b], prisma);
    expect(again.contactIds).toEqual([a, b]);
  });

  it("should remove members", async () => {
    const a = await createContact("[TEST] Agent F");
    const b = await createContact("[TEST] Agent G");

    const conv = await createConversation(
      { title: "[TEST] Remove members", type: ConversationType.Group, ownerId: userId, contactIds: [a, b] },
      prisma
    );

    const afterRemove = await removeConversationMembers(conv.id, [a], prisma);
    expect(afterRemove.contactIds).toEqual([b]);
  });
});
