import { describe, it, expect } from "vitest";
import { extractMentions, resolveMentions, decomposeMessage } from "../intent-analyzer.js";
import type { Agent } from "@agenthub/shared";
import { AgentProvider } from "@agenthub/shared";

const mockAgents: Agent[] = [
  {
    id: "agent_1",
    name: "产品经理",
    provider: AgentProvider.Claude,
    model: "claude-sonnet-4-6",
    config: {},
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "agent_2",
    name: "设计师",
    provider: AgentProvider.Claude,
    model: "claude-sonnet-4-6",
    config: {},
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "agent_3",
    name: "前端开发",
    provider: AgentProvider.OpenCode,
    model: "anthropic/claude-sonnet-4-6",
    config: {},
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
];

describe("extractMentions", () => {
  it("extracts single @mention", () => {
    expect(extractMentions("你好 @产品经理")).toEqual(["产品经理"]);
  });

  it("extracts multiple @mentions", () => {
    expect(extractMentions("@产品经理 @设计师 帮我看一下")).toEqual(["产品经理", "设计师"]);
  });

  it("deduplicates repeated mentions", () => {
    expect(extractMentions("@产品经理 这个功能 @产品经理 你觉得呢")).toEqual(["产品经理"]);
  });

  it("returns empty array when no mentions", () => {
    expect(extractMentions("你好世界")).toEqual([]);
  });

  it("handles mentions with Chinese punctuation", () => {
    expect(extractMentions("@产品经理，你好")).toEqual(["产品经理"]);
  });
});

describe("resolveMentions", () => {
  it("resolves mention names to agent records (case-insensitive)", () => {
    const result = resolveMentions(["产品经理", "设计师"], mockAgents);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe("agent_1");
    expect(result[1]!.id).toBe("agent_2");
  });

  it("skips unknown mentions", () => {
    const result = resolveMentions(["不存在的人"], mockAgents);
    expect(result).toHaveLength(0);
  });

  it("returns empty for empty input", () => {
    expect(resolveMentions([], mockAgents)).toHaveLength(0);
  });
});

describe("decomposeMessage", () => {
  const baseParams = {
    content: "@产品经理 @设计师 @前端开发 帮我设计一个登录页面",
    agents: mockAgents,
    conversationId: "conv_1",
    parentMessageId: "msg_1",
  };

  it("creates one sub-task per mentioned agent", () => {
    const result = decomposeMessage(baseParams);
    expect(result.subtasks).toHaveLength(3);
    expect(result.subtasks[0]!.agentId).toBe("agent_1");
    expect(result.subtasks[1]!.agentId).toBe("agent_2");
    expect(result.subtasks[2]!.agentId).toBe("agent_3");
  });

  it("sets all sub-tasks as parallel when no sequence words", () => {
    const result = decomposeMessage(baseParams);
    // All in a single layer = parallel
    expect(result.layers.length).toBe(1);
    expect(result.layers[0]).toHaveLength(3);
  });

  it("builds serial dependency chain when sequence words present", () => {
    const result = decomposeMessage({
      ...baseParams,
      content: "先让 @产品经理 分析需求，再让 @设计师 设计方案，然后让 @前端开发 实现",
    });
    // Expect 3 layers (serial)
    expect(result.subtasks[0]!.dependsOn).toEqual([]);
    expect(result.subtasks[1]!.dependsOn).toEqual([result.subtasks[0]!.id]);
    expect(result.subtasks[2]!.dependsOn).toEqual([result.subtasks[1]!.id]);
    expect(result.layers.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty decomposition when no agents match", () => {
    const result = decomposeMessage({
      ...baseParams,
      content: "@unknown_agent 你好",
    });
    expect(result.subtasks).toHaveLength(0);
    expect(result.layers).toHaveLength(0);
  });

  it("includes original message and conversation IDs", () => {
    const result = decomposeMessage(baseParams);
    expect(result.originalMessageId).toBe("msg_1");
    expect(result.conversationId).toBe("conv_1");
  });
});
