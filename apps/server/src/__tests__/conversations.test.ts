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

describe("Conversation API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let userId: string;
  let auth: { authorization: string };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();

    const user = await createTestUser(prisma, "test.cv.server@example.com");
    userId = user.id;
    auth = getAuthHeader(userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "test.cv.server@example.com" } });
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.conversation.deleteMany({
      where: { ownerId: userId },
    });
  });

  describe("GET /api/conversations/list", () => {
    it("should return paginated conversation list", async () => {
      await prisma.conversation.create({
        data: { title: "Test Conv 1", type: "Single", ownerId: userId },
      });
      await prisma.conversation.create({
        data: { title: "Test Conv 2", type: "Group", ownerId: userId },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/conversations/list",
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("total");
      expect(body.total).toBeGreaterThanOrEqual(2);
    });

    it("should exclude archived conversations by default", async () => {
      await prisma.conversation.create({
        data: {
          title: "Test Active Conv",
          type: "Single",
          ownerId: userId,
          isArchived: false,
        },
      });
      await prisma.conversation.create({
        data: {
          title: "Test Archived Conv",
          type: "Single",
          ownerId: userId,
          isArchived: true,
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/conversations/list",
        headers: auth,
      });

      const body = res.json();
      const archived = body.data.filter((c: any) => c.isArchived);
      expect(archived.length).toBe(0);
    });

    it("should include archived when requested", async () => {
      await prisma.conversation.create({
        data: {
          title: "Test Archived Conv",
          type: "Single",
          ownerId: userId,
          isArchived: true,
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/conversations/list?includeArchived=true",
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const archived = body.data.filter((c: any) => c.isArchived);
      expect(archived.length).toBeGreaterThanOrEqual(1);
    });

    it("should return 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/conversations/list",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/conversations/create", () => {
    it("should create a conversation and return 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/create",
        headers: auth,
        payload: { title: "New Test Conv", type: "Single" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.title).toBe("New Test Conv");
      expect(body.type).toBe("Single");
      expect(body.ownerId).toBe(userId);
    });

    it("should create a group conversation", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/create",
        headers: auth,
        payload: { title: "New Group Conv", type: "Group", contactIds: [] },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().type).toBe("Group");
    });

    it("should reject missing title", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/create",
        headers: auth,
        payload: { type: "Single" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject invalid type", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/create",
        headers: auth,
        payload: { title: "Bad", type: "Invalid" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/conversations/:id/detail", () => {
    it("should return conversation detail with recent messages", async () => {
      const conv = await prisma.conversation.create({
        data: { title: "Test Detail", type: "Single", ownerId: userId },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${conv.id}/detail`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe("Test Detail");
      expect(res.json()).toHaveProperty("messages");
    });

    it("should return 404 for non-existent conversation", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/conversations/non-existent/detail",
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /api/conversations/:id/update", () => {
    it("should update conversation title", async () => {
      const conv = await prisma.conversation.create({
        data: { title: "Before Update", type: "Single", ownerId: userId },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/conversations/${conv.id}/update`,
        headers: auth,
        payload: { title: "After Update" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe("After Update");
    });

    it("should archive a conversation", async () => {
      const conv = await prisma.conversation.create({
        data: { title: "To Archive", type: "Single", ownerId: userId },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/conversations/${conv.id}/update`,
        headers: auth,
        payload: { isArchived: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().isArchived).toBe(true);
    });

    it("should return 404 for non-existent conversation", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/conversations/non-existent/update",
        headers: auth,
        payload: { title: "Nope" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/conversations/:id/delete", () => {
    it("should delete a conversation and return 204", async () => {
      const conv = await prisma.conversation.create({
        data: { title: "To Delete", type: "Single", ownerId: userId },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${conv.id}/delete`,
        headers: auth,
      });

      expect(res.statusCode).toBe(204);

      // Verify deleted
      const deleted = await prisma.conversation.findUnique({ where: { id: conv.id } });
      expect(deleted).toBeNull();
    });

    it("should return 404 for non-existent conversation", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/conversations/non-existent/delete",
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
