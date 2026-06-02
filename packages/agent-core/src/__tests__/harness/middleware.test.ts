import { describe, it, expect, vi } from "vitest";
import { ChunkType } from "@agenthub/shared";
import { MiddlewarePipeline } from "../../harness/middleware/pipeline.js";
import type { AgentContext, Chunk } from "@agenthub/shared";
import type { AgentMiddleware } from "../../harness/middleware/types.js";

const baseContext: AgentContext = {
  conversationId: "conv-1",
  message: "hello",
  history: [],
  agents: [],
};

describe("MiddlewarePipeline", () => {
  it("should run beforeAgent hooks in sequence", async () => {
    const calls: string[] = [];
    const mw1: AgentMiddleware = {
      name: "mw1",
      beforeAgent: async (ctx) => { calls.push("mw1"); return { ...ctx, message: ctx.message + " +1" }; },
    };
    const mw2: AgentMiddleware = {
      name: "mw2",
      beforeAgent: async (ctx) => { calls.push("mw2"); return { ...ctx, message: ctx.message + " +2" }; },
    };

    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw1);
    pipeline.use(mw2);

    const result = await pipeline.runBeforeAgent(baseContext);

    expect(calls).toEqual(["mw1", "mw2"]);
    expect(result.message).toBe("hello +1 +2");
  });

  it("should run afterAgent hooks in sequence", async () => {
    const calls: string[] = [];
    const mw1: AgentMiddleware = {
      name: "mw1",
      afterAgent: async () => { calls.push("mw1"); },
    };
    const mw2: AgentMiddleware = {
      name: "mw2",
      afterAgent: async () => { calls.push("mw2"); },
    };

    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw1);
    pipeline.use(mw2);

    const chunks: Chunk[] = [];
    await pipeline.runAfterAgent(baseContext, chunks);

    expect(calls).toEqual(["mw1", "mw2"]);
  });

  it("should run onError hooks", async () => {
    const errors: Error[] = [];
    const mw: AgentMiddleware = {
      name: "error-logger",
      onError: async (err) => { errors.push(err); },
    };

    const pipeline = new MiddlewarePipeline();
    pipeline.use(mw);

    const testError = new Error("test error");
    await pipeline.runOnError(testError);

    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("test error");
  });

  it("should replace middleware with same name", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use({ name: "dup", beforeAgent: () => baseContext });
    pipeline.use({ name: "dup", beforeAgent: () => ({ ...baseContext, message: "replaced" }) });

    expect(pipeline.list()).toHaveLength(1);
    const result = await pipeline.runBeforeAgent(baseContext);
    expect(result.message).toBe("replaced");
  });

  it("should remove middleware by name", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use({ name: "keep", beforeAgent: (c) => c });
    pipeline.use({ name: "remove", beforeAgent: (c) => c });

    pipeline.remove("remove");

    expect(pipeline.list()).toEqual(["keep"]);
  });

  it("should list middleware names", () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use({ name: "a", beforeAgent: (c) => c });
    pipeline.use({ name: "b", beforeAgent: (c) => c });

    expect(pipeline.list()).toEqual(["a", "b"]);
  });

  it("should handle anonymous middleware", () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use({ beforeAgent: (c) => c });

    expect(pipeline.list()).toEqual(["(anonymous)"]);
  });

  it("should provide shared state", () => {
    const pipeline = new MiddlewarePipeline();
    const state = pipeline.getSharedState();
    expect(state.state).toBeInstanceOf(Map);
  });
});
