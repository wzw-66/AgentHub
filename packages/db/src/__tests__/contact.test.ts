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

describe("Contact Repository", () => {
  let prisma: PrismaClient;
  let userId: string;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        name: "[TEST] Contact User",
        email: `contact-test-${Date.now()}@test.dev`,
        passwordHash: "hash",
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    await prisma.$disconnect();
  });

  function makeAgentId(): Promise<string> {
    return prisma.agent
      .create({ data: { name: "[TEST] Agent", provider: "Claude" } })
      .then((a) => a.id);
  }

  async function cleanupAgent(id: string) {
    await prisma.contact
      .deleteMany({ where: { agentId: id } })
      .catch(() => {});
    await prisma.agent.delete({ where: { id } }).catch(() => {});
  }

  it("should create a contact", async () => {
    const agentId = await makeAgentId();
    const contact = await createContact(
      { userId, agentId, displayName: "[TEST] My Contact", tags: ["work"] },
      prisma
    );

    expect(contact.id).toBeDefined();
    expect(contact.displayName).toBe("[TEST] My Contact");

    await cleanupAgent(agentId);
  });

  it("should get a contact with agent info", async () => {
    const agentId = await makeAgentId();
    const created = await createContact(
      { userId, agentId, displayName: "[TEST] Get Contact" },
      prisma
    );

    const contact = await getContact(created.id, prisma);
    expect(contact).not.toBeNull();
    expect(contact!.displayName).toBe("[TEST] Get Contact");
    expect(contact!.agent.name).toBe("[TEST] Agent");

    await cleanupAgent(agentId);
  });

  it("should list contacts for a user", async () => {
    const agentId = await makeAgentId();
    await createContact(
      { userId, agentId, displayName: "[TEST] List Contact" },
      prisma
    );

    const contacts = await listContacts(userId, prisma);
    const testContacts = contacts.filter((c) =>
      c.displayName.startsWith("[TEST]")
    );
    expect(testContacts.length).toBeGreaterThanOrEqual(1);

    await cleanupAgent(agentId);
  });

  it("should reject duplicate (userId, agentId)", async () => {
    const agentId = await makeAgentId();

    await createContact(
      { userId, agentId, displayName: "[TEST] First" },
      prisma
    );

    await expect(
      createContact({ userId, agentId, displayName: "[TEST] Second" }, prisma)
    ).rejects.toThrow();

    await cleanupAgent(agentId);
  });

  it("should update a contact", async () => {
    const agentId = await makeAgentId();
    const created = await createContact(
      { userId, agentId, displayName: "[TEST] Before Update" },
      prisma
    );

    const updated = await updateContact(
      created.id,
      { displayName: "[TEST] After Update", isPinned: true },
      prisma
    );
    expect(updated.displayName).toBe("[TEST] After Update");
    expect(updated.isPinned).toBe(true);

    await cleanupAgent(agentId);
  });

  it("should delete a contact", async () => {
    const agentId = await makeAgentId();
    const created = await createContact(
      { userId, agentId, displayName: "[TEST] To Delete" },
      prisma
    );

    await deleteContact(created.id, prisma);
    const found = await getContact(created.id, prisma);
    expect(found).toBeNull();

    await cleanupAgent(agentId);
  });
});
