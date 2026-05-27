import { describe, it, expect, vi } from "vitest";
import { ResultAggregator } from "../aggregator.js";
import type { AggregatedResult } from "../types.js";

// ─── Fixtures ────────────────────────────────────────────────────────────

const allSuccessResult: AggregatedResult = {
  messageId: "",
  summary: "AgentA completed successfully; AgentB completed successfully.",
  taskResults: [
    { agentId: "agent_1", agentName: "AgentA", success: true, preview: "Output A" },
    { agentId: "agent_2", agentName: "AgentB", success: true, preview: "Output B" },
  ],
  totalTasks: 2,
  completedTasks: 2,
  failedTasks: 0,
  skippedTasks: 0,
};

const partialFailureResult: AggregatedResult = {
  messageId: "",
  summary: "AgentA completed successfully; AgentB failed: Oops.",
  taskResults: [
    { agentId: "agent_1", agentName: "AgentA", success: true, preview: "OK" },
    { agentId: "agent_2", agentName: "AgentB", success: false, preview: "", error: "Oops" },
  ],
  totalTasks: 2,
  completedTasks: 1,
  failedTasks: 1,
  skippedTasks: 0,
};

const emptyResult: AggregatedResult = {
  messageId: "",
  summary: "No sub-tasks to execute.",
  taskResults: [],
  totalTasks: 0,
  completedTasks: 0,
  failedTasks: 0,
  skippedTasks: 0,
};

// ─── Tests ───────────────────────────────────────────────────────────────

describe("ResultAggregator", () => {
  it("persists summary message and artifact for all-success result", async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: "msg_agg_1" });
    const createArtifact = vi.fn().mockResolvedValue({ id: "art_1" });
    const pushSSE = vi.fn();

    const agg = new ResultAggregator(createMessage, createArtifact);
    const messageId = await agg.persist(allSuccessResult, "conv_1", "msg_1", pushSSE);

    expect(messageId).toBe("msg_agg_1");
    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createMessage).toHaveBeenCalledWith({
      conversationId: "conv_1",
      senderType: "System",
      senderId: "orchestrator",
      type: "Text",
      content: "AgentA completed successfully; AgentB completed successfully.",
      parentId: "msg_1",
    });

    expect(createArtifact).toHaveBeenCalledTimes(1);
    const artifactCall = createArtifact.mock.calls[0]![0]!;
    expect(artifactCall.messageId).toBe("msg_agg_1");
    expect(artifactCall.type).toBe("Document");
    expect(artifactCall.status).toBe("Completed");
    expect(artifactCall.content).toContain("AgentA");
    expect(artifactCall.content).toContain("AgentB");
  });

  it("sets artifact status to Failed when there are failures", async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: "msg_agg_2" });
    const createArtifact = vi.fn().mockResolvedValue({ id: "art_2" });
    const pushSSE = vi.fn();

    const agg = new ResultAggregator(createMessage, createArtifact);
    await agg.persist(partialFailureResult, "conv_1", "msg_1", pushSSE);

    expect(createArtifact).toHaveBeenCalledTimes(1);
    expect(createArtifact.mock.calls[0]![0]!.status).toBe("Failed");
  });

  it("pushes orchestrator:aggregated SSE event", async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: "msg_agg_3" });
    const createArtifact = vi.fn().mockResolvedValue({ id: "art_3" });
    const pushSSE = vi.fn();

    const agg = new ResultAggregator(createMessage, createArtifact);
    await agg.persist(allSuccessResult, "conv_1", "msg_1", pushSSE);

    expect(pushSSE).toHaveBeenCalledTimes(1);
    expect(pushSSE).toHaveBeenCalledWith("orchestrator:aggregated", {
      summary: "AgentA completed successfully; AgentB completed successfully.",
      totalTasks: 2,
      completedTasks: 2,
      failedTasks: 0,
      skippedTasks: 0,
    });
  });

  it("handles empty result gracefully", async () => {
    const createMessage = vi.fn().mockResolvedValue({ id: "msg_agg_4" });
    const createArtifact = vi.fn().mockResolvedValue({ id: "art_4" });
    const pushSSE = vi.fn();

    const agg = new ResultAggregator(createMessage, createArtifact);
    await agg.persist(emptyResult, "conv_1", "msg_1", pushSSE);

    expect(createMessage).toHaveBeenCalledTimes(1);
    expect(createArtifact).toHaveBeenCalledTimes(1);
    // No failures means status is "Completed" even for empty
    expect(createArtifact.mock.calls[0]![0]!.status).toBe("Completed");
  });
});
