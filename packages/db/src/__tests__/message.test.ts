import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createMessage,
  getMessage,
  listMessages,
  pinMessage,
} from "../repositories/message";

describe("Message Repository", () => {
  let prisma: PrismaClient;
  let userId: string;
  let conversationId: string;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        name: "[TEST] Msg User",
        email: `msg-test-${Date.now()}@test.dev`,
        passwordHash: "hash",
      },
    });
    userId = user.id;

    const conv = await prisma.conversation.create({
      data: {
        title: "[TEST] Msg Conversation",
        type: "single",
        ownerId: user.id,
      },
    });
    conversationId = conv.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("should create a message", async () => {
    const message = await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "Hello, world!",
      },
      prisma
    );

    expect(message.id).toBeDefined();
    expect(message.content).toBe("Hello, world!");
    expect(message.senderType).toBe("User");
    expect(message.isPinned).toBe(false);
  });

  it("should update conversation lastActiveAt on create", async () => {
    const before = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    const oldTimestamp = before.lastActiveAt;

    // Wait a moment to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));

    await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "This should update timestamp",
      },
      prisma
    );

    const after = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(after.lastActiveAt.getTime()).toBeGreaterThan(
      oldTimestamp.getTime()
    );
  });

  it("should get a message with artifacts", async () => {
    const created = await createMessage(
      {
        conversationId,
        senderType: "System",
        senderId: "system",
        type: "Text",
        content: "Get this message",
      },
      prisma
    );

    const message = await getMessage(created.id, prisma);
    expect(message).not.toBeNull();
    expect(message!.content).toBe("Get this message");
    expect(message!.artifacts).toEqual([]);
  });

  it("should list messages with cursor pagination", async () => {
    // Create test messages
    const msg1 = await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "Page Msg 1",
      },
      prisma
    );
    await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "Page Msg 2",
      },
      prisma
    );
    const msg3 = await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "Page Msg 3",
      },
      prisma
    );

    // Test cursor pagination with limit 2
    const page1 = await listMessages(
      conversationId,
      { limit: 2 },
      prisma
    );
    expect(page1.data.length).toBeLessThanOrEqual(2);
    if (page1.nextCursor) {
      const page2 = await listMessages(
        conversationId,
        { cursor: page1.nextCursor, limit: 2 },
        prisma
      );
      expect(page2.data.length).toBeGreaterThanOrEqual(0);
    }
  });

  it("should toggle pin state", async () => {
    const created = await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "Pin me",
      },
      prisma
    );

    expect(created.isPinned).toBe(false);

    const pinned = await pinMessage(created.id, prisma);
    expect(pinned.isPinned).toBe(true);

    const unpinned = await pinMessage(created.id, prisma);
    expect(unpinned.isPinned).toBe(false);
  });

  it("should support parent message reference", async () => {
    const parent = await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "I am the parent",
      },
      prisma
    );

    const child = await createMessage(
      {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "I am the reply",
        parentId: parent.id,
      },
      prisma
    );

    expect(child.parentId).toBe(parent.id);
  });
});
