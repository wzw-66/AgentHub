import { describe, it, expect } from "vitest";
import { LocalSandboxProvider } from "../../../harness/sandbox/local-sandbox-provider.js";

describe("LocalSandboxProvider", () => {
  it("should acquire a sandbox and return its ID", async () => {
    const provider = new LocalSandboxProvider("/tmp");
    const id = await provider.acquire("test-thread");
    expect(id).toBe("local-test-thread");
  });

  it("should get the same sandbox for the same thread ID", async () => {
    const provider = new LocalSandboxProvider("/tmp");
    const id1 = await provider.acquire("same-thread");
    const id2 = await provider.acquire("same-thread");
    expect(id1).toBe(id2);

    const sb1 = provider.get(id1);
    const sb2 = provider.get(id2);
    expect(sb1).toBe(sb2);
  });

  it("should return null for unknown sandbox", () => {
    const provider = new LocalSandboxProvider("/tmp");
    expect(provider.get("nonexistent")).toBeNull();
  });

  it("should release a sandbox", async () => {
    const provider = new LocalSandboxProvider("/tmp");
    const id = await provider.acquire("release-me");
    expect(provider.get(id)).not.toBeNull();
    await provider.release(id);
    expect(provider.get(id)).toBeNull();
  });

  it("should shutdown and clear all sandboxes", async () => {
    const provider = new LocalSandboxProvider("/tmp");
    await provider.acquire("a");
    await provider.acquire("b");
    await provider.shutdown();
    // After shutdown, acquire should still work
    const id = await provider.acquire("fresh");
    expect(id).toBe("local-fresh");
  });
});
