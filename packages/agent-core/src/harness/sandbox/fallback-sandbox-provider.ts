import type { Sandbox, SandboxProvider } from "./types.js";

/**
 * Fallback mode for FallbackSandboxProvider.
 * - strict: AioSandbox must succeed or error
 * - warn: fallback to LocalSandbox with warning
 * - force: skip AioSandbox, use LocalSandbox directly
 */
export type FallbackMode = "strict" | "warn" | "force";

/**
 * Orchestrates between a primary (AioSandbox) and fallback (LocalSandbox) provider.
 *
 * Tracks which provider created each sandbox for correct cleanup on release/shutdown.
 */
export class FallbackSandboxProvider implements SandboxProvider {
  private primary: SandboxProvider;
  private fallback: SandboxProvider;
  private mode: FallbackMode;
  private sandboxOrigin: Map<string, "docker" | "local"> = new Map();

  constructor(
    primary: SandboxProvider,
    fallback: SandboxProvider,
    mode: FallbackMode = "warn",
  ) {
    this.primary = primary;
    this.fallback = fallback;
    this.mode = mode;
  }

  async acquire(threadId: string = "default"): Promise<string> {
    if (this.mode === "force") {
      const id = await this.fallback.acquire(threadId);
      this.sandboxOrigin.set(id, "local");
      return id;
    }

    try {
      const id = await this.primary.acquire(threadId);
      this.sandboxOrigin.set(id, "docker");
      return id;
    } catch (err) {
      if (this.mode === "strict") {
        throw err;
      }

      // warn mode — log and fallback
      console.warn(
        `[FallbackSandboxProvider] AioSandbox unavailable (${(err as Error).message}), falling back to LocalSandbox`,
      );
      const id = await this.fallback.acquire(threadId);
      this.sandboxOrigin.set(id, "local");
      return id;
    }
  }

  async get(sandboxId: string): Promise<Sandbox | null> {
    const origin = this.sandboxOrigin.get(sandboxId);
    if (origin === "docker") {
      return this.primary.get(sandboxId);
    }
    if (origin === "local") {
      return this.fallback.get(sandboxId);
    }
    return null;
  }

  async release(sandboxId: string): Promise<void> {
    const origin = this.sandboxOrigin.get(sandboxId);
    if (origin === "docker") {
      await this.primary.release(sandboxId);
    } else if (origin === "local") {
      await this.fallback.release(sandboxId);
    }
    this.sandboxOrigin.delete(sandboxId);
  }

  async shutdown(): Promise<void> {
    await Promise.all([
      this.primary.shutdown?.().catch(() => {}),
      this.fallback.shutdown?.().catch(() => {}),
    ]);
    this.sandboxOrigin.clear();
  }

  /**
   * Get the sandbox type for a given sandbox ID (for context injection).
   * Returns "docker", "local", or null if unknown.
   */
  getSandboxType(sandboxId: string): "docker" | "local" | null {
    return this.sandboxOrigin.get(sandboxId) ?? null;
  }

  /**
   * Get all sandbox origins (for diagnostics).
   */
  getOrigins(): Map<string, "docker" | "local"> {
    return new Map(this.sandboxOrigin);
  }

  /**
   * Set the fallback mode at runtime.
   */
  setMode(mode: FallbackMode): void {
    this.mode = mode;
  }

  /**
   * Get the current fallback mode.
   */
  getMode(): FallbackMode {
    return this.mode;
  }
}
