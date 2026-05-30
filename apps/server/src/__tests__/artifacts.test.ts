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

describe("Artifact API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let userId: string;
  let auth: { authorization: string };
  let conversationId: string;
  let messageId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();

    const user = await createTestUser(prisma, "test.ar.server@example.com");
    userId = user.id;
    auth = getAuthHeader(userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "test.ar.server@example.com" } });
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const conv = await prisma.conversation.create({
      data: { title: "Test Artifact Conv", type: "single", ownerId: userId },
    });
    conversationId = conv.id;

    const msg = await prisma.message.create({
      data: {
        conversationId,
        senderType: "User",
        senderId: userId,
        type: "Text",
        content: "Check this artifact",
      },
    });
    messageId = msg.id;
  });

  afterEach(async () => {
    await prisma.artifact.deleteMany({ where: { messageId } });
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.conversation.deleteMany({ where: { ownerId: userId } });
  });

  describe("GET /api/artifacts/:id/detail", () => {
    it("should return artifact detail", async () => {
      const artifact = await prisma.artifact.create({
        data: {
          messageId,
          type: "Document",
          content: "# Hello\nThis is a test artifact.",
          status: "Completed",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/artifacts/${artifact.id}/detail`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.type).toBe("Document");
      expect(body.content).toContain("Hello");
      expect(body.status).toBe("Completed");
    });

    it("should return 404 for non-existent artifact", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/artifacts/non-existent/detail",
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });

    it("should return 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/artifacts/some-id/detail",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("GET /api/artifacts/:id/preview", () => {
    it("should return artifact preview", async () => {
      const artifact = await prisma.artifact.create({
        data: {
          messageId,
          type: "WebPreview",
          url: "https://example.com",
          previewUrl: "https://example.com/preview",
          content: "<h1>Preview</h1>",
          status: "Completed",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/artifacts/${artifact.id}/preview`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.previewUrl).toBe("https://example.com/preview");
      expect(body.content).toBe("<h1>Preview</h1>");
      expect(body.type).toBe("WebPreview");
      // Should not include full fields like url
      expect(body.url).toBeUndefined();
    });

    it("should return 404 for non-existent artifact", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/artifacts/non-existent/preview",
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
