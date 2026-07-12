import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AioSandboxProvider } from "../../../harness/sandbox/aio-sandbox-provider.js";
import type { DockerSandboxConfig } from "../../../harness/sandbox/docker-config.js";

// Mock dockerode
vi.mock("dockerode", () => {
  const mockStop = vi.fn();
  const mockRemove = vi.fn();
  const mockStart = vi.fn();
  const mockExec = vi.fn();
  const mockContainer = {
    exec: mockExec,
    stop: mockStop,
    remove: mockRemove,
    start: mockStart,
  };
  const MockDocker = vi.fn(() => ({
    modem: { demuxStream: vi.fn(), followProgress: vi.fn() },
    listContainers: vi.fn().mockResolvedValue([]),
    createContainer: vi.fn().mockResolvedValue(mockContainer),
    getContainer: vi.fn().mockReturnValue(mockContainer),
    getImage: vi.fn().mockReturnValue({ inspect: vi.fn().mockResolvedValue(undefined) }),
    pull: vi.fn((_image: string, _options: object, callback: Function) => callback(null)),
  }));
  return { default: MockDocker };
});

describe("AioSandboxProvider", () => {
  let provider: AioSandboxProvider;
  const testConfig: DockerSandboxConfig = {
    image: "docker/sandbox-templates:shell",
    workingDir: "/home/agent/workspace",
    idleTimeout: 100, // Short timeout for testing
  };

  beforeEach(() => {
    vi.useFakeTimers();
    provider = new AioSandboxProvider(testConfig);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should acquire a sandbox and return its ID", async () => {
    const id = await provider.acquire("test-thread");
    expect(id).toMatch(/^agenthub-sandbox-/);
  });

  it("should return the same ID for the same thread", async () => {
    const id1 = await provider.acquire("same-thread");
    const id2 = await provider.acquire("same-thread");
    expect(id1).toBe(id2);
  });

  it("should get a sandbox after acquire", async () => {
    const id = await provider.acquire("get-test");
    const sb = await provider.get(id);
    expect(sb).not.toBeNull();
  });

  it("should return null for unknown sandbox ID", async () => {
    const sb = await provider.get("nonexistent");
    expect(sb).toBeNull();
  });

  it("should release a sandbox", async () => {
    const id = await provider.acquire("release-test");
    expect(await provider.get(id)).not.toBeNull();
    await provider.release(id);
    expect(await provider.get(id)).toBeNull();
  });

  it("should shut down all sandboxes via shutdown", async () => {
    const id1 = await provider.acquire("a");
    const id2 = await provider.acquire("b");
    await provider.shutdown();
    // After shutdown, sandboxes should be gone
    expect(await provider.get(id1)).toBeNull();
    expect(await provider.get(id2)).toBeNull();
  });

  it("should mark and clean up idle containers", async () => {
    const id = await provider.acquire("idle-test");
    expect(await provider.get(id)).not.toBeNull();

    // Advance time past idle timeout
    vi.advanceTimersByTime(200);

    // After idle timeout, the sandbox should be released
    expect(await provider.get(id)).toBeNull();
  });

  it("should reset idle timer on repeated acquire", async () => {
    const id = await provider.acquire("refresh-test");
    expect(await provider.get(id)).not.toBeNull();

    // Advance time to just under timeout
    vi.advanceTimersByTime(50);

    // Re-acquire resets the timer
    const id2 = await provider.acquire("refresh-test");
    expect(id2).toBe(id);

    // Advance past original timeout
    vi.advanceTimersByTime(80);

    // Should still be alive (timer was reset)
    expect(await provider.get(id)).not.toBeNull();

    // Now advance past the reset timeout
    vi.advanceTimersByTime(120);
    expect(await provider.get(id)).toBeNull();
  });
});
