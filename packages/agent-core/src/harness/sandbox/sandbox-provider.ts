import type { Sandbox, SandboxProvider } from "./types.js";

/**
 * Manages sandbox lifecycle -- acquire, cache, release.
 */
export class SandboxManager {
  private provider: SandboxProvider | null = null;
  private sandboxIds: Map<string, string> = new Map(); // threadId -> sandboxId

  constructor(provider?: SandboxProvider) {
    this.provider = provider ?? null;
  }

  setProvider(provider: SandboxProvider): void {
    this.provider = provider;
  }

  async getSandbox(threadId: string = "default"): Promise<Sandbox> {
    if (!this.provider) {
      throw new Error("No SandboxProvider configured");
    }

    // Check cached ID for this thread
    const cachedId = this.sandboxIds.get(threadId);
    if (cachedId) {
      const existing = await this.provider.get(cachedId);
      if (existing) return existing;
    }

    // Acquire new sandbox
    const sandboxId = await this.provider.acquire(threadId);
    this.sandboxIds.set(threadId, sandboxId);

    const sandbox = await this.provider.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Provider returned null for newly acquired sandbox: ${sandboxId}`);
    }
    return sandbox;
  }

  async destroySandbox(threadId: string = "default"): Promise<void> {
    const sandboxId = this.sandboxIds.get(threadId);
    if (!sandboxId) return;

    if (this.provider) {
      await this.provider.release(sandboxId);
    }
    this.sandboxIds.delete(threadId);
  }

  async destroyAll(): Promise<void> {
    if (this.provider?.shutdown) {
      await this.provider.shutdown();
    } else {
      for (const [, sandboxId] of this.sandboxIds) {
        await this.provider?.release(sandboxId);
      }
    }
    this.sandboxIds.clear();
  }

  getProvider(): SandboxProvider | null {
    return this.provider;
  }
}
