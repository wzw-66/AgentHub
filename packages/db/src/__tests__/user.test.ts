import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient, TEST_DATABASE_URL } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createUser,
  findUserByEmail,
  findUserById,
} from "../repositories/user";

describe("User Repository", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: { startsWith: "test." } },
    });
  });

  it("should create a user", async () => {
    const user = await createUser(
      {
        name: "Test User",
        email: "test.create@example.com",
        passwordHash: "$2a$10$hashedpassword",
      },
      prisma
    );

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test.create@example.com");
    expect(user.passwordHash).toBe("$2a$10$hashedpassword");
    expect(user.avatarUrl).toBeNull();
  });

  it("should find a user by email", async () => {
    await createUser(
      {
        name: "Find by Email",
        email: "test.findbyemail@example.com",
        passwordHash: "$2a$10$hashedpassword",
      },
      prisma
    );

    const found = await findUserByEmail("test.findbyemail@example.com", prisma);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find by Email");
    expect(found!.email).toBe("test.findbyemail@example.com");
  });

  it("should return null when email not found", async () => {
    const result = await findUserByEmail("test.nonexistent@example.com", prisma);
    expect(result).toBeNull();
  });

  it("should find a user by id", async () => {
    const created = await createUser(
      {
        name: "Find by ID",
        email: "test.findbyid@example.com",
        passwordHash: "$2a$10$hashedpassword",
      },
      prisma
    );

    const found = await findUserById(created.id, prisma);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Find by ID");
    expect(found!.id).toBe(created.id);
  });

  it("should return null when id not found", async () => {
    const result = await findUserById("nonexistent-id", prisma);
    expect(result).toBeNull();
  });

  it("should enforce unique email constraint", async () => {
    await createUser(
      {
        name: "First User",
        email: "test.unique@example.com",
        passwordHash: "$2a$10$hash1",
      },
      prisma
    );

    await expect(
      createUser(
        {
          name: "Second User",
          email: "test.unique@example.com",
          passwordHash: "$2a$10$hash2",
        },
        prisma
      )
    ).rejects.toThrow();
  });
});
