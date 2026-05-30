import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createContact,
  getContact,
  listContacts,
  updateContact,
  deleteContact,
} from "../repositories/contact";

describe("Contact Repository (Agent merged)", () => {
  let prisma: PrismaClient;
  let testUserId: string;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
    // Create a test user to use as userId for all test contacts
    const user = await prisma.user.create({
      data: {
        name: "[TEST] Contact User",
        email: `contact-test-${Date.now()}@test.dev`,
        passwordHash: "hash",
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Clean up test user
    await prisma.user.deleteMany({ where: { name: "[TEST] Contact User" } }).catch(() => {});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.contact.deleteMany({
      where: { name: { startsWith: "[TEST]" } },
    });
  });

  it("should create a contact with agent fields", async () => {
    const contact = await createContact(
      {
        userId: testUserId,
        name: "[TEST] Claude Contact",
        provider: "Claude",
        systemPrompt: "You are helpful",
        model: "claude-sonnet-4-6",
      },
      prisma
    );

    expect(contact.id).toBeDefined();
    expect(contact.name).toBe("[TEST] Claude Contact");
    expect(contact.provider).toBe("Claude");
    expect(contact.model).toBe("claude-sonnet-4-6");
    expect(contact.userId).toBe(testUserId);
  });

  it("should get a contact by id", async () => {
    const created = await createContact(
      { userId: testUserId, name: "[TEST] Get Contact", provider: "OpenCode" },
      prisma
    );

    const contact = await getContact(created.id, prisma);
    expect(contact).not.toBeNull();
    expect(contact!.name).toBe("[TEST] Get Contact");
  });

  it("should list contacts for a user", async () => {
    await createContact({ userId: testUserId, name: "[TEST] Contact A", provider: "Claude" }, prisma);
    await createContact({ userId: testUserId, name: "[TEST] Contact B", provider: "OpenCode" }, prisma);

    const contacts = await listContacts(testUserId, {}, prisma);
    const testContacts = contacts.filter((c) => c.name.startsWith("[TEST]"));
    expect(testContacts.length).toBeGreaterThanOrEqual(2);
  });

  it("should filter contacts by provider", async () => {
    await createContact({ userId: testUserId, name: "[TEST] Claude Only", provider: "Claude" }, prisma);
    await createContact(
      { userId: testUserId, name: "[TEST] OpenCode Only", provider: "OpenCode" },
      prisma
    );

    const claudeContacts = await listContacts(testUserId, { provider: "Claude" }, prisma);
    const testClaude = claudeContacts.filter((c) => c.name.startsWith("[TEST]"));
    expect(testClaude.every((c) => c.provider === "Claude")).toBe(true);
  });

  it("should update a contact", async () => {
    const created = await createContact(
      { userId: testUserId, name: "[TEST] Before Update", provider: "Custom" },
      prisma
    );

    const updated = await updateContact(
      created.id,
      { name: "[TEST] After Update", model: "gpt-4" },
      prisma
    );
    expect(updated.name).toBe("[TEST] After Update");
    expect(updated.model).toBe("gpt-4");
  });

  it("should delete a contact", async () => {
    const created = await createContact(
      { userId: testUserId, name: "[TEST] To Delete", provider: "Claude" },
      prisma
    );

    await deleteContact(created.id, prisma);
    const contact = await getContact(created.id, prisma);
    expect(contact).toBeNull();
  });
});
