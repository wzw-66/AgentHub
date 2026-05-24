import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  ConversationType,
  SenderType,
  MessageType,
  ArtifactType,
  ArtifactStatus,
  AgentProvider,
  ChunkType,
} from "../index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("exports", () => {
  it("should export all enums", () => {
    expect(ConversationType).toBeDefined();
    expect(SenderType).toBeDefined();
    expect(MessageType).toBeDefined();
    expect(ArtifactType).toBeDefined();
    expect(ArtifactStatus).toBeDefined();
    expect(AgentProvider).toBeDefined();
    expect(ChunkType).toBeDefined();
  });

  it("should not have runtime dependencies", () => {
    const pkgPath = resolve(__dirname, "../../package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    expect(pkg.dependencies).toEqual({});
  });
});
