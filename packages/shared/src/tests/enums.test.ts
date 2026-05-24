import { describe, it, expect } from "vitest";
import {
  ConversationType,
  SenderType,
  MessageType,
  ArtifactType,
  ArtifactStatus,
  AgentProvider,
  ChunkType,
} from "../index.js";

describe("ConversationType", () => {
  it("should have correct values", () => {
    expect(ConversationType.Single).toBe("single");
    expect(ConversationType.Group).toBe("group");
  });
});

describe("SenderType", () => {
  it("should have correct values", () => {
    expect(SenderType.User).toBe("user");
    expect(SenderType.Contact).toBe("contact");
    expect(SenderType.System).toBe("system");
  });
});

describe("MessageType", () => {
  it("should have correct values", () => {
    expect(MessageType.Text).toBe("text");
    expect(MessageType.Code).toBe("code");
    expect(MessageType.Diff).toBe("diff");
    expect(MessageType.Preview).toBe("preview");
    expect(MessageType.Artifact).toBe("artifact");
  });
});

describe("ArtifactType", () => {
  it("should have correct values", () => {
    expect(ArtifactType.Code).toBe("code");
    expect(ArtifactType.WebPreview).toBe("web_preview");
    expect(ArtifactType.Document).toBe("document");
    expect(ArtifactType.Diff).toBe("diff");
  });
});

describe("ArtifactStatus", () => {
  it("should have correct values", () => {
    expect(ArtifactStatus.Building).toBe("building");
    expect(ArtifactStatus.Completed).toBe("completed");
    expect(ArtifactStatus.Failed).toBe("failed");
  });
});

describe("AgentProvider", () => {
  it("should have correct values", () => {
    expect(AgentProvider.Claude).toBe("claude");
    expect(AgentProvider.OpenCode).toBe("opencode");
    expect(AgentProvider.Custom).toBe("custom");
  });
});

describe("ChunkType", () => {
  it("should have correct values", () => {
    expect(ChunkType.Text).toBe("text");
    expect(ChunkType.Code).toBe("code");
    expect(ChunkType.ToolCall).toBe("tool_call");
    expect(ChunkType.Artifact).toBe("artifact");
    expect(ChunkType.Error).toBe("error");
    expect(ChunkType.Done).toBe("done");
  });
});
