import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTestApp, createTestUser, getAuthHeader, createTestAgent } from "./helpers";
import type { FastifyInstance } from "fastify";

const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ||
  "postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test";

describe("Agent API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let userId: string;
  let auth: { authorization: string };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();

    const user = await createTestUser(prisma, "test.ag.server@example.com");
    userId = user.id;
    auth = getAuthHeader(userId);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: "test.ag.server@example.com" } });
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.agent.deleteMany({ where: { name: { startsWith: "Ag-" } } });
  });

  describe("GET /api/agents/list", () => {
    it("should return agent list", async () => {
      await createTestAgent(prisma, { name: "Ag-Alpha" });
      await createTestAgent(prisma, { name: "Ag-Beta", provider: "OpenCode" });

      const res = await app.inject({
        method: "GET",
        url: "/api/agents/list",
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      // At least our test agents exist
      const testAgents = body.filter((a: any) => a.name.startsWith("Ag-"));
      expect(testAgents.length).toBe(2);
    });

    it("should filter by provider", async () => {
      await createTestAgent(prisma, { name: "Ag-Claude", provider: "Claude" });
      await createTestAgent(prisma, { name: "Ag-OpenCode", provider: "OpenCode" });

      const res = await app.inject({
        method: "GET",
        url: "/api/agents/list?provider=Claude",
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const filtered = body.filter((a: any) => a.name.startsWith("Ag-"));
      expect(filtered.every((a: any) => a.provider === "Claude")).toBe(true);
    });

    it("should return 401 without auth", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/agents/list",
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("POST /api/agents/create", () => {
    it("should create an agent and return 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agents/create",
        headers: auth,
        payload: {
          name: "Ag-Custom",
          provider: "Custom",
          systemPrompt: "You are a test agent",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe("Ag-Custom");
      expect(body.provider).toBe("Custom");
      expect(body.systemPrompt).toBe("You are a test agent");
      expect(body.id).toBeDefined();
    });

    it("should reject missing name", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agents/create",
        headers: auth,
        payload: { provider: "Claude" },
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject invalid provider", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agents/create",
        headers: auth,
        payload: { name: "Bad Agent", provider: "InvalidProvider" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/agents/:id/detail", () => {
    it("should return agent detail", async () => {
      const agent = await createTestAgent(prisma, { name: "Ag-Detail" });

      const res = await app.inject({
        method: "GET",
        url: `/api/agents/${agent.id}/detail`,
        headers: auth,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Ag-Detail");
    });

    it("should return 404 for non-existent agent", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/agents/non-existent-id/detail",
        headers: auth,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
