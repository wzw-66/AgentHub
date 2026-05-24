import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createCredential,
  getCredential,
  listCredentials,
  deleteCredential,
} from "../repositories/credential";

describe("Credential Repository", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        name: "[TEST] Cred User",
        email: `cred-test-${Date.now()}@test.dev`,
        passwordHash: "hash",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should create a credential", async () => {
    const cred = await createCredential(
      {
        userId,
        provider: "anthropic",
        encryptedKey: "sk-encrypted-abc123",
      },
      prisma
    );

    expect(cred.id).toBeDefined();
    expect(cred.provider).toBe("anthropic");
    expect(cred.encryptedKey).toBe("sk-encrypted-abc123");
  });

  it("should get credential by id", async () => {
    const created = await createCredential(
      { userId, provider: "openai", encryptedKey: "sk-encrypted-xyz" },
      prisma
    );

    const cred = await getCredential(created.id, prisma);
    expect(cred).not.toBeNull();
    expect(cred!.provider).toBe("openai");
  });

  it("should list credentials for a user", async () => {
    const credentials = await listCredentials(userId, prisma);
    expect(credentials.length).toBeGreaterThanOrEqual(1);
    expect(
      credentials.some((c) => c.provider === "anthropic")
    ).toBe(true);
  });

  it("should delete a credential", async () => {
    const created = await createCredential(
      { userId, provider: "test-delete", encryptedKey: "sk-test-delete" },
      prisma
    );

    await deleteCredential(created.id, prisma);
    const found = await getCredential(created.id, prisma);
    expect(found).toBeNull();
  });
});
