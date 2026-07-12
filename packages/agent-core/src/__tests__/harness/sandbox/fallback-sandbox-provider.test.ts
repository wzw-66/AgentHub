import { describe, it, expect, vi, beforeEach } from "vitest";
import { FallbackSandboxProvider } from "../../../harness/sandbox/fallback-sandbox-provider.js";
import type { SandboxProvider, Sandbox } from "../../../harness/sandbox/types.js";

describe("FallbackSandboxProvider", () => {
  let mockPrimary: SandboxProvider;
  let mockFallback: SandboxProvider;
  const workingSandbox: Sandbox = {
    exec: async () => ({ stdout: "ok", stderr: "", exitCode: 0 }),
    readFile: async () => "content",
    writeFile: async () => {},
    updateFile: async () => {},
    listDir: async () => ["file.txt"],
  };

  beforeEach(() => {
    mockPrimary = {
      acquire: vi.fn().mockResolvedValue("docker-1"),
      get: vi.fn().mockResolvedValue(workingSandbox),
      release: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    mockFallback = {
      acquire: vi.fn().mockResolvedValue("local-1"),
      get: vi.fn().mockResolvedValue(workingSandbox),
      release: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe("strict mode", () => {
    it("should use primary when available", async () => {
      const provider = new FallbackSandboxProvider(mockPrimary, mockFallback, "strict");
      const id = await provider.acquire("test");
      expect(mockPrimary.acquire).toHaveBeenCalledWith("test");
      expect(id).toBe("docker-1");
    });

    it("should throw when primary fails in strict mode", async () => {
      const failingPrimary: SandboxProvider = {
        acquire: vi.fn().mockRejectedValue(new Error("Docker unavailable")),
        get: vi.fn().mockRejectedValue(new Error("Not found")),
        release: vi.fn(),
      };
      const provider = new FallbackSandboxProvider(failingPrimary, mockFallback, "strict");
      await expect(provider.acquire("test")).rejects.toThrow("Docker unavailable");
    });
  });

  describe("warn mode", () => {
    it("should fallback to local when primary fails", async () => {
      const failingPrimary: SandboxProvider = {
        acquire: vi.fn().mockRejectedValue(new Error("Docker unavailable")),
        get: vi.fn().mockRejectedValue(new Error("Not found")),
        release: vi.fn(),
      };
      const provider = new FallbackSandboxProvider(failingPrimary, mockFallback, "warn");
      const id = await provider.acquire("test");
      expect(mockFallback.acquire).toHaveBeenCalledWith("test");
      expect(id).toBe("local-1");
    });

    it("should use primary when available in warn mode", async () => {
      const provider = new FallbackSandboxProvider(mockPrimary, mockFallback, "warn");
      const id = await provider.acquire("test");
      expect(mockPrimary.acquire).toHaveBeenCalled();
      expect(mockFallback.acquire).not.toHaveBeenCalled();
      expect(id).toBe("docker-1");
    });
  });

  describe("force mode", () => {
    it("should skip primary entirely", async () => {
      const provider = new FallbackSandboxProvider(mockPrimary, mockFallback, "force");
      const id = await provider.acquire("test");
      expect(mockPrimary.acquire).not.toHaveBeenCalled();
      expect(mockFallback.acquire).toHaveBeenCalledWith("test");
      expect(id).toBe("local-1");
    });
  });

  it("should get a sandbox from the correct provider", async () => {
    const provider = new FallbackSandboxProvider(mockPrimary, mockFallback, "warn");
    await provider.acquire("get-test");
    const sb = await provider.get("docker-1");
    expect(sb).toEqual(workingSandbox);
  });

  it("should release a sandbox from the correct provider", async () => {
    const provider = new FallbackSandboxProvider(mockPrimary, mockFallback, "warn");
    await provider.acquire("release-test");
    await provider.release("docker-1");
    expect(mockPrimary.release).toHaveBeenCalledWith("docker-1");
  });

  it("should shutdown both providers", async () => {
    const provider = new FallbackSandboxProvider(mockPrimary, mockFallback, "warn");
    await provider.acquire("a");
    await provider.acquire("b");
    await provider.shutdown();
    expect(mockPrimary.shutdown).toHaveBeenCalled();
    // If Aio fails, local was used
    expect(mockFallback.shutdown).toHaveBeenCalled();
  });

  it("should return null for unknown sandbox", async () => {
    const provider = new FallbackSandboxProvider(mockPrimary, mockFallback, "strict");
    const sb = await provider.get("unknown-id");
    expect(sb).toBeNull();
  });
});
