import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createTestApp,
  createTestUser,
  getAuthHeader,
} from "./helpers";
import type { FastifyInstance } from "fastify";

const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ||
  "postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test";

describe("Message API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let userId: string;
  let conversationId: string;
  let auth: { authorization: string };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();

    const user = await createTestUser(prisma, "test.ms.server@example.com");
    userId = user.id;
    auth = getAuthHeader(userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "test.ms.server@example.com" } });
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const conv = await prisma.conversation.create({
      data: { title: "Test Message Conv", type: "single", ownerId: userId },
    });
    conversationId = conv.id;
  });

  afterEach(async () => {
    await prisma.message.deleteMany({
      where: { conversationId },
    });
    await prisma.conversation.deleteMany({
      where: { ownerId: userId },
    });
  });

  describe("GET /api/conversations/:conversationId/messages/list", () => {
    it("should return paginated messages", async () => {
      await prisma.message.create({
        data: {
          conversationId,
          senderType: "User",
          senderId: userId,
          type: "Text",
          content: "First message",
        },
      });
      await prisma.message.create({
        data: {
          conversationId,
          senderType: "User",
          senderId: userId,
          type: "Text",
          content: "Second message",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${conversationId}/messages/list`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("nextCursor");
      expect(body.data.length).toBe(2);
    });

    it("should respect limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await prisma.message.create({
          data: {
            conversationId,
            senderType: "User",
            senderId: userId,
            type: "Text",
            content: `Message ${i}`,
          },
        });
      }

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${conversationId}/messages/list?limit=2`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBe(2);
    });

    it("should return 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${conversationId}/messages/list`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/conversations/:conversationId/messages/create", () => {
    it("should create a message and return 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversationId}/messages/create`,
        headers: auth,
        payload: { content: "Hello, world!", type: "Text" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.content).toBe("Hello, world!");
      expect(body.senderType).toBe("User");
      expect(body.senderId).toBe(userId);
      expect(body.conversationId).toBe(conversationId);
    });

    it("should default type to Text", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversationId}/messages/create`,
        headers: auth,
        payload: { content: "Just text" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().type).toBe("Text");
    });

    it("should reject empty content", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversationId}/messages/create`,
        headers: auth,
        payload: { content: "" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/conversations/:conversationId/messages/:messageId/pin", () => {
    it("should toggle pin status on", async () => {
      const msg = await prisma.message.create({
        data: {
          conversationId,
          senderType: "User",
          senderId: userId,
          type: "Text",
          content: "Pin me",
          isPinned: false,
        },
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversationId}/messages/${msg.id}/pin`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().isPinned).toBe(true);
    });

    it("should toggle pin status off", async () => {
      const msg = await prisma.message.create({
        data: {
          conversationId,
          senderType: "User",
          senderId: userId,
          type: "Text",
          content: "Unpin me",
          isPinned: true,
        },
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversationId}/messages/${msg.id}/pin`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().isPinned).toBe(false);
    });

    it("should return 404 for non-existent message", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversationId}/messages/non-existent/pin`,
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });

    it("should return 404 when message doesn't belong to conversation", async () => {
      const otherConv = await prisma.conversation.create({
        data: { title: "Other Conv", type: "single", ownerId: userId },
      });
      const msg = await prisma.message.create({
        data: {
          conversationId: otherConv.id,
          senderType: "User",
          senderId: userId,
          type: "Text",
          content: "Wrong conversation",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conversationId}/messages/${msg.id}/pin`,
        headers: auth,
      });

      expect(res.statusCode).toBe(404);

      await prisma.message.deleteMany({ where: { conversationId: otherConv.id } });
      await prisma.conversation.deleteMany({ where: { id: otherConv.id } });
    });
  });
});
