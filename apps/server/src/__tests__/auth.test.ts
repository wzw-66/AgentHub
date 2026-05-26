import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createTestApp, createTestUser } from "./helpers";
import type { FastifyInstance } from "fastify";

const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ||
  "postgresql://agenthub:agenthub_dev@localhost:5432/agenthub_test";

describe("Auth API", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DATABASE_URL });
    await prisma.$connect();
    app = await createTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up auth test users only (unique prefix to avoid cross-file pollution)
    await prisma.user.deleteMany({
      where: { email: { startsWith: "test.auth." } },
    });
  });

  // ─── Register ───────────────────────────────────────────────────────────────

  describe("POST /auth/register", () => {
    it("should register a new user and return tokens", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "test.auth.register@example.com",
          name: "Register User",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe("test.auth.register@example.com");
      expect(body.user.name).toBe("Register User");
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
    });

    it("should reject duplicate email", async () => {
      // Create user directly via DB to pre-populate
      await prisma.user.create({
        data: {
          name: "Existing User",
          email: "test.auth.duplicate@example.com",
          passwordHash: "$2a$10$dummyhash",
        },
      });

      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "test.auth.duplicate@example.com",
          name: "Duplicate User",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it("should reject invalid email format", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "not-an-email",
          name: "Bad Email",
          password: "password123",
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it("should reject short password", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "test.auth.shortpw@example.com",
          name: "Short PW",
          password: "1234567",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Login ──────────────────────────────────────────────────────────────────

  describe("POST /auth/login", () => {
    it("should login with valid credentials", async () => {
      await createTestUser(prisma, "test.auth.login@example.com", "myPassword123");

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "test.auth.login@example.com",
          password: "myPassword123",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe("test.auth.login@example.com");
      expect(body.accessToken).toBeDefined();
      expect(body.refreshToken).toBeDefined();
    });

    it("should reject wrong password", async () => {
      await createTestUser(prisma, "test.auth.wrongpw@example.com", "correctPassword");

      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "test.auth.wrongpw@example.com",
          password: "wrongPassword",
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should reject non-existent email", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "test.auth.nonexistent@example.com",
          password: "somePassword",
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ─── Refresh ────────────────────────────────────────────────────────────────

  describe("POST /auth/refresh", () => {
    it("should refresh access token with valid refresh token", async () => {
      // Register first to get a valid refresh token
      const registerRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "test.auth.refresh@example.com",
          name: "Refresh User",
          password: "password123",
        },
      });

      const { refreshToken } = registerRes.json();

      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { refreshToken },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.accessToken).toBeDefined();
      expect(typeof body.accessToken).toBe("string");
    });

    it("should reject invalid refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { refreshToken: "invalid-token" },
      });

      expect(res.statusCode).toBe(401);
    });

    it("should reject empty refresh token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/refresh",
        payload: { refreshToken: "" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ─── Middleware ─────────────────────────────────────────────────────────────

  describe("JWT Auth Middleware", () => {
    it("should pass with valid access token", async () => {
      const registerRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "test.auth.middleware@example.com",
          name: "Middleware User",
          password: "password123",
        },
      });

      const { accessToken } = registerRes.json();

      const res = await app.inject({
        method: "GET",
        url: "/api/protected-test",
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toBe("ok");
      expect(body.userId).toBeDefined();
    });

    it("should reject missing authorization header", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/protected-test",
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("missing_token");
    });

    it("should reject invalid token format", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/protected-test",
        headers: { authorization: "NotBearer token123" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
