import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMIntentAnalyzer, decomposeMessage } from "../intent-analyzer.js";
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

describe("LLMIntentAnalyzer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("analyze", () => {
    it("returns null when no agents provided", async () => {
      const analyzer = new LLMIntentAnalyzer();
      Object.defineProperty(analyzer, "apiKey", { value: "test-key" });
      const result = await analyzer.analyze("hello", []);
      expect(result).toBeNull();
    });

    it("falls back to all agents when no API key configured", async () => {
      // Temporarily clear the API key
      const origEnv = process.env["API_KEY"];
      process.env["API_KEY"] = "";

      // Re-create analyzer (it reads config at construction time)
      // Since config reads env at call time, we just test the fallback path
      const analyzer = new LLMIntentAnalyzer({ timeout: 1000 });
      // Mock the apiKey to be undefined
      Object.defineProperty(analyzer, "apiKey", { value: undefined });

      const result = await analyzer.analyze("帮我开发一个程序", mockAgents);

      expect(result).not.toBeNull();
      expect(result!.assignedAgents).toHaveLength(3);
      expect(result!.order).toBe("parallel");

      process.env["API_KEY"] = origEnv;
    });

    it("returns correct result on successful LLM call", async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: "开发一个登录页面",
              assignedAgents: [
                { agentId: "agent_2", instruction: "设计登录页面UI" },
                { agentId: "agent_3", instruction: "实现登录页面" },
              ],
              order: "serial",
              summary: "设计师先设计，前端再实现",
            }),
          },
        }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const analyzer = new LLMIntentAnalyzer({ timeout: 5000 });
      // Mock apiKey so it doesn't hit fallback
      Object.defineProperty(analyzer, "apiKey", { value: "test-key" });

      const result = await analyzer.analyze(
        "@设计师 @前端开发 帮我设计一个登录页面",
        mockAgents,
      );

      expect(result).not.toBeNull();
      expect(result!.intent).toBe("开发一个登录页面");
      expect(result!.assignedAgents).toHaveLength(2);
      expect(result!.assignedAgents[0]!.agentId).toBe("agent_2");
      expect(result!.assignedAgents[0]!.instruction).toBe("设计登录页面UI");
      expect(result!.order).toBe("serial");
    });

    it("returns null when LLM returns empty assignedAgents", async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: "greeting",
              assignedAgents: [],
              order: "parallel",
              summary: "无需agent参与",
            }),
          },
        }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const analyzer = new LLMIntentAnalyzer({ timeout: 5000 });
      Object.defineProperty(analyzer, "apiKey", { value: "test-key" });

      const result = await analyzer.analyze("大家好", mockAgents);

      expect(result).toBeNull();
    });

    it("falls back on API error", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const analyzer = new LLMIntentAnalyzer({ timeout: 1000, maxRetries: 0 });
      Object.defineProperty(analyzer, "apiKey", { value: "test-key" });

      const result = await analyzer.analyze("帮我开发一个程序", mockAgents);

      // Should fall back to assigning all agents
      expect(result).not.toBeNull();
      expect(result!.assignedAgents).toHaveLength(3);
      expect(result!.order).toBe("parallel");
    });

    it("filters out invalid assignedAgents entries", async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              intent: "test",
              assignedAgents: [
                { agentId: "agent_1", instruction: "需求分析" },
                { agentId: "", instruction: "" }, // invalid
                {},
              ],
              order: "parallel",
              summary: "test",
            }),
          },
        }],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const analyzer = new LLMIntentAnalyzer({ timeout: 5000 });
      Object.defineProperty(analyzer, "apiKey", { value: "test-key" });

      const result = await analyzer.analyze("test", mockAgents);

      expect(result).not.toBeNull();
      expect(result!.assignedAgents).toHaveLength(1);
      expect(result!.assignedAgents[0]!.agentId).toBe("agent_1");
    });
  });
});

describe("decomposeMessage", () => {
  const baseParams = {
    content: "@产品经理 @设计师 @前端开发 帮我设计一个登录页面",
    agents: mockAgents,
    conversationId: "conv_1",
    parentMessageId: "msg_1",
  };

  it("returns empty decomposition when no agents", async () => {
    const result = await decomposeMessage({ ...baseParams, agents: [] });
    expect(result.subtasks).toHaveLength(0);
    expect(result.layers).toHaveLength(0);
  });

  it("creates sub-tasks from LLM result", async () => {
    const mockAnalyzer = new LLMIntentAnalyzer({ timeout: 1000 });
    vi.spyOn(mockAnalyzer, "analyze").mockResolvedValue({
      intent: "design login page",
      assignedAgents: [
        { agentId: "agent_1", instruction: "分析需求" },
        { agentId: "agent_2", instruction: "设计UI" },
      ],
      order: "serial",
      summary: "产品经理先分析需求，设计师再设计UI",
    });

    const result = await decomposeMessage({
      ...baseParams,
      analyzer: mockAnalyzer,
    });

    expect(result.subtasks).toHaveLength(2);
    expect(result.subtasks[0]!.agentId).toBe("agent_1");
    expect(result.subtasks[0]!.instruction).toBe("分析需求");
    expect(result.subtasks[1]!.agentId).toBe("agent_2");
    expect(result.subtasks[1]!.instruction).toBe("设计UI");
    expect(result.originalMessageId).toBe("msg_1");
  });

  it("builds serial dependency chain when order is serial", async () => {
    const mockAnalyzer = new LLMIntentAnalyzer({ timeout: 1000 });
    vi.spyOn(mockAnalyzer, "analyze").mockResolvedValue({
      intent: "design login page",
      assignedAgents: [
        { agentId: "agent_1", instruction: "分析需求" },
        { agentId: "agent_2", instruction: "设计UI" },
      ],
      order: "serial",
      summary: "串行执行",
    });

    const result = await decomposeMessage({
      ...baseParams,
      analyzer: mockAnalyzer,
    });

    expect(result.subtasks[0]!.dependsOn).toEqual([]);
    expect(result.subtasks[1]!.dependsOn).toEqual([result.subtasks[0]!.id]);
  });

  it("builds parallel layers when order is parallel", async () => {
    const mockAnalyzer = new LLMIntentAnalyzer({ timeout: 1000 });
    vi.spyOn(mockAnalyzer, "analyze").mockResolvedValue({
      intent: "design login page",
      assignedAgents: [
        { agentId: "agent_1", instruction: "任务A" },
        { agentId: "agent_2", instruction: "任务B" },
      ],
      order: "parallel",
      summary: "并行执行",
    });

    const result = await decomposeMessage({
      ...baseParams,
      analyzer: mockAnalyzer,
    });

    // All tasks should have empty dependsOn (parallel)
    expect(result.subtasks.every((s) => s.dependsOn.length === 0)).toBe(true);
    // All in a single layer
    expect(result.layers.length).toBe(1);
  });

  it("skips agents that are not in the provided agents list", async () => {
    const mockAnalyzer = new LLMIntentAnalyzer({ timeout: 1000 });
    vi.spyOn(mockAnalyzer, "analyze").mockResolvedValue({
      intent: "test",
      assignedAgents: [
        { agentId: "agent_1", instruction: "任务" },
        { agentId: "nonexistent", instruction: "不存在的agent" },
      ],
      order: "parallel",
      summary: "test",
    });

    const result = await decomposeMessage({
      ...baseParams,
      analyzer: mockAnalyzer,
    });

    // Only the valid agent should be included
    expect(result.subtasks).toHaveLength(1);
    expect(result.subtasks[0]!.agentId).toBe("agent_1");
  });

  it("returns empty when LLM returns no assignments", async () => {
    const mockAnalyzer = new LLMIntentAnalyzer({ timeout: 1000 });
    vi.spyOn(mockAnalyzer, "analyze").mockResolvedValue(null);

    const result = await decomposeMessage({
      ...baseParams,
      analyzer: mockAnalyzer,
    });

    expect(result.subtasks).toHaveLength(0);
    expect(result.layers).toHaveLength(0);
  });

  it("returns originalMessageId and conversationId", async () => {
    const mockAnalyzer = new LLMIntentAnalyzer({ timeout: 1000 });
    vi.spyOn(mockAnalyzer, "analyze").mockResolvedValue({
      intent: "test",
      assignedAgents: [
        { agentId: "agent_1", instruction: "任务" },
      ],
      order: "parallel",
      summary: "test",
    });

    const result = await decomposeMessage({
      ...baseParams,
      analyzer: mockAnalyzer,
    });

    expect(result.originalMessageId).toBe("msg_1");
    expect(result.conversationId).toBe("conv_1");
  });
});
