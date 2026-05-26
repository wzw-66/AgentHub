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

describe("Credential API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let userId: string;
  let otherUserId: string;
  let auth: { authorization: string };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();

    const user = await createTestUser(prisma, "test.cr.owner@example.com");
    userId = user.id;
    auth = getAuthHeader(userId);

    const otherUser = await createTestUser(prisma, "test.cr.other@example.com");
    otherUserId = otherUser.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ["test.cr.owner@example.com", "test.cr.other@example.com"] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.userCredential.deleteMany({
      where: { OR: [{ userId }, { userId: otherUserId }] },
    });
  });

  describe("GET /api/credentials/list", () => {
    it("should return credential list with masked encryptedKey", async () => {
      await prisma.userCredential.create({
        data: {
          userId,
          provider: "openai",
          encryptedKey: "sk-secret-key-12345",
        },
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/credentials/list",
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      const cred = body.find((c: any) => c.provider === "openai");
      expect(cred).toBeDefined();
      expect(cred.encryptedKey).toBe("****");
      expect(cred.encryptedKey).not.toBe("sk-secret-key-12345");
    });

    it("should return 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/credentials/list",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/credentials/create", () => {
    it("should create a credential and return 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/credentials/create",
        headers: auth,
        payload: {
          provider: "anthropic",
          encryptedKey: "sk-ant-secret",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.provider).toBe("anthropic");
      expect(body.userId).toBe(userId);
    });

    it("should reject missing provider", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/credentials/create",
        headers: auth,
        payload: { encryptedKey: "some-key" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject missing encryptedKey", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/credentials/create",
        headers: auth,
        payload: { provider: "openai" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/credentials/:id/delete", () => {
    it("should delete a credential and return 204", async () => {
      const cred = await prisma.userCredential.create({
        data: { userId, provider: "test", encryptedKey: "test-key" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/credentials/${cred.id}/delete`,
        headers: auth,
      });

      expect(res.statusCode).toBe(204);

      const deleted = await prisma.userCredential.findUnique({ where: { id: cred.id } });
      expect(deleted).toBeNull();
    });

    it("should return 404 for non-existent credential", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/credentials/non-existent/delete",
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });

    it("should return 403 when deleting another user's credential", async () => {
      const cred = await prisma.userCredential.create({
        data: { userId: otherUserId, provider: "test", encryptedKey: "test-key" },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/credentials/${cred.id}/delete`,
        headers: auth,
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
