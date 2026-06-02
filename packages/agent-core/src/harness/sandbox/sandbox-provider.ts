import type { Sandbox, SandboxProvider } from "./types.js";

/**
 * Manages sandbox lifecycle — create, cache, destroy.
 */
export class SandboxManager {
  private provider: SandboxProvider | null = null;
  private sandboxes: Map<string, Sandbox> = new Map();

  constructor(provider?: SandboxProvider) {
    this.provider = provider ?? null;
  }

  setProvider(provider: SandboxProvider): void {
    this.provider = provider;
  }

  async getSandbox(id: string = "default"): Promise<Sandbox> {
    const existing = this.sandboxes.get(id);
    if (existing) return existing;

    if (!this.provider) {
      throw new Error("No SandboxProvider configured");
    }

    const sandbox = await this.provider.create();
    this.sandboxes.set(id, sandbox);
    return sandbox;
  }

  async destroySandbox(id: string = "default"): Promise<void> {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) return;

    if (this.provider) {
      await this.provider.destroy(sandbox);
    }
    this.sandboxes.delete(id);
  }

  async destroyAll(): Promise<void> {
    for (const [id] of this.sandboxes) {
      await this.destroySandbox(id);
    }
  }
}
