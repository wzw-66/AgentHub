import { describe, it, expect, vi, beforeEach } from "vitest";
import { SandboxMiddleware } from "../../../harness/middleware/sandbox-middleware.js";
import type { SandboxProvider } from "../../../harness/sandbox/types.js";
import type { AgentContext } from "@agenthub/shared";

describe("SandboxMiddleware", () => {
  let mockProvider: SandboxProvider;
  let sandboxInstance: ReturnType<typeof createMockSandbox>;

  function createMockSandbox() {
    return {
      exec: vi.fn().mockResolvedValue({ stdout: "ok", stderr: "", exitCode: 0 }),
      readFile: vi.fn().mockResolvedValue("file content"),
      writeFile: vi.fn().mockResolvedValue(undefined),
      updateFile: vi.fn().mockResolvedValue(undefined),
      listDir: vi.fn().mockResolvedValue(["a.txt"]),
    };
  }

  beforeEach(() => {
    sandboxInstance = createMockSandbox();
    mockProvider = {
      acquire: vi.fn().mockResolvedValue("sandbox-1"),
      get: vi.fn().mockResolvedValue(sandboxInstance),
      release: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe("lazy init (default)", () => {
    it("should not acquire sandbox in beforeAgent by default", async () => {
      const middleware = new SandboxMiddleware({ provider: mockProvider, lazyInit: true });

      const context: AgentContext = {
        conversationId: "conv-1",
        message: "hello",
      };

      const result = await middleware.beforeAgent?.(context);
      expect(mockProvider.acquire).not.toHaveBeenCalled();
      expect(result).toBe(context);
    });

    it("should acquire on getOrCreateSandbox call", async () => {
      const middleware = new SandboxMiddleware({ provider: mockProvider, lazyInit: true });
      const sb = await middleware.getOrCreateSandbox("conv-1");
      expect(mockProvider.acquire).toHaveBeenCalledWith("conv-1");
      expect(sb).toBe(sandboxInstance);
    });

    it("should cache sandbox per conversation", async () => {
      const middleware = new SandboxMiddleware({ provider: mockProvider, lazyInit: true });
      await middleware.getOrCreateSandbox("conv-2");
      await middleware.getOrCreateSandbox("conv-2");
      expect(mockProvider.acquire).toHaveBeenCalledTimes(1);
    });
  });

  describe("eager init", () => {
    it("should acquire sandbox in beforeAgent", async () => {
      const middleware = new SandboxMiddleware({ provider: mockProvider, lazyInit: false });

      const context: AgentContext = {
        conversationId: "conv-eager",
        message: "hello",
      };

      const result = await middleware.beforeAgent?.(context);
      expect(mockProvider.acquire).toHaveBeenCalledWith("conv-eager");
      expect(result).toBeDefined();
    });
  });

  describe("afterAgent", () => {
    it("should be a no-op for lazy mode", async () => {
      const middleware = new SandboxMiddleware({ provider: mockProvider, lazyInit: true });
      const context: AgentContext = { conversationId: "c", message: "m" };
      await expect(middleware.afterAgent?.(context, [])).resolves.toBeUndefined();
    });

    it("should be a no-op for eager mode", async () => {
      const middleware = new SandboxMiddleware({ provider: mockProvider, lazyInit: false });
      const context: AgentContext = { conversationId: "c", message: "m" };
      await expect(middleware.afterAgent?.(context, [])).resolves.toBeUndefined();
    });
  });

  it("should have the name 'sandbox'", () => {
    const middleware = new SandboxMiddleware({ provider: mockProvider });
    expect(middleware.name).toBe("sandbox");
  });

  it("should allow setting sandbox type for context injection", async () => {
    const middleware = new SandboxMiddleware({
      provider: mockProvider,
      sandboxType: "docker",
    });
    expect(middleware.name).toBe("sandbox");

    const context: AgentContext = { conversationId: "ctx-test", message: "m" };
    const result = await middleware.beforeAgent!(context);
    // The context should have a sandboxType property (injected via middleware)
    expect(result).toBeDefined();
    expect((result as any).sandboxType).toBe("docker");
  });

  it("should require a provider to be set", () => {
    // @ts-expect-error - testing that missing provider throws at runtime
    expect(() => new SandboxMiddleware({})).toThrow("SandboxProvider is required");
  });

  it("should release a sandbox by thread ID", async () => {
    const middleware = new SandboxMiddleware({ provider: mockProvider });
    await middleware.getOrCreateSandbox("release-thread");
    expect(mockProvider.acquire).toHaveBeenCalledWith("release-thread");

    await middleware.releaseSandbox("release-thread");
    expect(mockProvider.release).toHaveBeenCalledWith("sandbox-1");
  });

  it("should release all sandboxes", async () => {
    const middleware = new SandboxMiddleware({ provider: mockProvider });
    await middleware.getOrCreateSandbox("thread-a");
    await middleware.getOrCreateSandbox("thread-b");

    // Each acquire gets "sandbox-1" (mock returns same ID) - that's fine
    await middleware.releaseAll();
    expect(mockProvider.release).toHaveBeenCalledTimes(2);
  });
});
