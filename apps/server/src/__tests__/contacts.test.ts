import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  createTestApp,
  createTestUser,
  createTestContact,
  getAuthHeader,
} from "./helpers";
import type { FastifyInstance } from "fastify";

const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ||
  "postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test";

describe("Contact API", () => {
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

    const user = await createTestUser(prisma, "test.co.owner@example.com");
    userId = user.id;
    auth = getAuthHeader(userId);

    const otherUser = await createTestUser(prisma, "test.co.other@example.com");
    otherUserId = otherUser.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ["test.co.owner@example.com", "test.co.other@example.com"] } },
    });
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.contact.deleteMany({
      where: { name: { startsWith: "Co-" } },
    });
  });

  describe("GET /api/contacts/list", () => {
    it("should return contact list for the authenticated user", async () => {
      await createTestContact(prisma, { name: "Co-ListA", userId });
      await createTestContact(prisma, { name: "Co-ListB", userId });

      const res = await app.inject({
        method: "GET",
        url: "/api/contacts/list",
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const testContacts = body.filter((c: any) => c.name.startsWith("Co-"));
      expect(testContacts.length).toBe(2);
    });

    it("should return 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/contacts/list",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/contacts/create", () => {
    it("should create a contact with agent config and return 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/contacts/create",
        headers: auth,
        payload: { name: "Co-New", provider: "Claude" },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe("Co-New");
      expect(body.provider).toBe("Claude");
      expect(body.userId).toBe(userId);
    });

    it("should reject missing name", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/contacts/create",
        headers: auth,
        payload: { provider: "Claude" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("PATCH /api/contacts/:id/update", () => {
    it("should update a contact", async () => {
      const contact = await createTestContact(prisma, { name: "Co-Before", userId });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/contacts/${contact.id}/update`,
        headers: auth,
        payload: { displayName: "Co-After", isPinned: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().displayName).toBe("Co-After");
      expect(res.json().isPinned).toBe(true);
    });

    it("should return 404 for non-existent contact", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: "/api/contacts/non-existent/update",
        headers: auth,
        payload: { displayName: "Nope" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("should return 403 when updating another user's contact", async () => {
      const contact = await createTestContact(prisma, { name: "Co-Others", userId: otherUserId });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/contacts/${contact.id}/update`,
        headers: auth,
        payload: { displayName: "Hacked" },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/contacts/:id/delete", () => {
    it("should delete a contact and return 204", async () => {
      const contact = await createTestContact(prisma, { name: "Co-Delete", userId });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/contacts/${contact.id}/delete`,
        headers: auth,
      });

      expect(res.statusCode).toBe(204);

      // Verify deleted
      const deleted = await prisma.contact.findUnique({ where: { id: contact.id } });
      expect(deleted).toBeNull();
    });

    it("should return 404 for non-existent contact", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/contacts/non-existent/delete",
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });

    it("should return 403 when deleting another user's contact", async () => {
      const contact = await createTestContact(prisma, { name: "Co-OthersDel", userId: otherUserId });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/contacts/${contact.id}/delete`,
        headers: auth,
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
