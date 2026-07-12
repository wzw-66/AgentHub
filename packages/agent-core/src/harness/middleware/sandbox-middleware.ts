import type { AgentContext } from "@agenthub/shared";
import type { AgentMiddleware } from "./types.js";
import type { Sandbox, SandboxProvider } from "../sandbox/types.js";

/**
 * Configuration for SandboxMiddleware.
 */
export interface SandboxMiddlewareConfig {
  /** The SandboxProvider to use for acquiring sandboxes. */
  provider?: SandboxProvider;
  /** If true, sandbox is only acquired on first tool call (default: true). */
  lazyInit?: boolean;
  /** Optional sandbox type string for context injection ("docker" | "local"). */
  sandboxType?: string;
}

/**
 * Middleware that bridges SandboxProvider lifecycle with AgentHarness.
 *
 * In lazy mode (default), sandbox is not acquired until getOrCreateSandbox()
 * is called — intended for tools to lazily init on first use.
 * In eager mode, sandbox is acquired in beforeAgent().
 */
export class SandboxMiddleware implements AgentMiddleware {
  readonly name = "sandbox";
  private provider: SandboxProvider;
  private lazyInit: boolean;
  private sandboxType?: string;
  private sandboxCache: Map<string, string> = new Map(); // conversationId → sandboxId

  constructor(config: SandboxMiddlewareConfig) {
    if (!config.provider) {
      throw new Error("SandboxProvider is required for SandboxMiddleware");
    }
    this.provider = config.provider;
    this.lazyInit = config.lazyInit ?? true;
    this.sandboxType = config.sandboxType;
  }

  beforeAgent(context: AgentContext): AgentContext | Promise<AgentContext> {
    // Inject sandbox type into context for agent awareness.
    // Only spread when sandboxType is set so the original reference is
    // preserved for lazy/no-sandboxType mode (tests rely on referential
    // equality between the returned context and the input).
    const enriched = this.sandboxType
      ? { ...context, sandboxType: this.sandboxType }
      : context;

    if (!this.lazyInit) {
      // Eager init: acquire immediately in beforeAgent
      return this.acquireForContext(context.conversationId).then(() => enriched);
    }

    return enriched;
  }

  afterAgent(_context: AgentContext, _chunks: unknown[]): Promise<void> {
    // No-op: sandbox lifecycle is managed by middleware or external cleanup
    return Promise.resolve();
  }

  /**
   * Get or create a sandbox for the given conversation/thread.
   * This is the primary API used by tools.
   */
  async getOrCreateSandbox(threadId: string): Promise<Sandbox> {
    // Check cache
    const cachedId = this.sandboxCache.get(threadId);
    if (cachedId) {
      const cached = await this.provider.get(cachedId);
      if (cached) return cached;
    }

    // Acquire new
    const sandboxId = await this.provider.acquire(threadId);
    this.sandboxCache.set(threadId, sandboxId);

    const sandbox = await this.provider.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Provider returned null for sandbox ID: ${sandboxId}`);
    }
    return sandbox;
  }

  /**
   * Release a sandbox for a conversation.
   */
  async releaseSandbox(threadId: string): Promise<void> {
    const sandboxId = this.sandboxCache.get(threadId);
    if (sandboxId) {
      await this.provider.release(sandboxId);
      this.sandboxCache.delete(threadId);
    }
  }

  /**
   * Release all managed sandboxes.
   */
  async releaseAll(): Promise<void> {
    const ids = Array.from(this.sandboxCache.values());
    await Promise.all(ids.map((id) => this.provider.release(id).catch(() => {})));
    this.sandboxCache.clear();
  }

  private async acquireForContext(conversationId: string): Promise<string> {
    const existing = this.sandboxCache.get(conversationId);
    if (existing) return existing;

    const sandboxId = await this.provider.acquire(conversationId);
    this.sandboxCache.set(conversationId, sandboxId);
    return sandboxId;
  }
}
