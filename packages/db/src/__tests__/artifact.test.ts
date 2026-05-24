import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestClient } from "./setup";
import type { PrismaClient } from "@prisma/client";
import {
  createArtifact,
  getArtifact,
  listArtifacts,
  updateArtifact,
} from "../repositories/artifact";

describe("Artifact Repository", () => {
  let prisma: PrismaClient;
  let messageId: string;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();

    const user = await prisma.user.create({
      data: {
        name: "[TEST] Artifact User",
        email: `artifact-test-${Date.now()}@test.dev`,
        passwordHash: "hash",
      },
    });

    const conv = await prisma.conversation.create({
      data: {
        title: "[TEST] Artifact Conversation",
        type: "Single",
        ownerId: user.id,
      },
    });

    const msg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderType: "User",
        senderId: user.id,
        type: "Text",
        content: "artifact parent message",
      },
    });
    messageId = msg.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("should create an artifact", async () => {
    const artifact = await createArtifact(
      {
        messageId,
        type: "CodeDiff",
        content: "diff content",
        status: "Building",
      },
      prisma
    );

    expect(artifact.id).toBeDefined();
    expect(artifact.type).toBe("CodeDiff");
    expect(artifact.status).toBe("Building");
  });

  it("should get an artifact by id", async () => {
    const created = await createArtifact(
      { messageId, type: "WebPreview", url: "https://example.com" },
      prisma
    );

    const artifact = await getArtifact(created.id, prisma);
    expect(artifact).not.toBeNull();
    expect(artifact!.url).toBe("https://example.com");
  });

  it("should list artifacts for a message", async () => {
    const artifacts = await listArtifacts(messageId, prisma);
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
  });

  it("should update artifact status", async () => {
    const created = await createArtifact(
      { messageId, type: "Document", status: "Building" },
      prisma
    );

    const updated = await updateArtifact(
      created.id,
      { status: "Completed", url: "https://final.url/doc" },
      prisma
    );
    expect(updated.status).toBe("Completed");
    expect(updated.url).toBe("https://final.url/doc");
  });
});
