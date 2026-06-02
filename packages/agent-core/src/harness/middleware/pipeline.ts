import type { AgentContext, Chunk } from "@agenthub/shared";
import type { AgentMiddleware, MiddlewareContext } from "./types.js";

/**
 * Runs a chain of middleware hooks in sequence.
 */
export class MiddlewarePipeline {
  private middlewares: AgentMiddleware[] = [];
  private shared: MiddlewareContext = { state: new Map() };

  /**
   * Register a middleware. If a middleware with the same name exists,
   * it is replaced.
   */
  use(middleware: AgentMiddleware): void {
    if (middleware.name) {
      const idx = this.middlewares.findIndex((m) => m.name === middleware.name);
      if (idx >= 0) {
        this.middlewares[idx] = middleware;
        return;
      }
    }
    this.middlewares.push(middleware);
  }

  /**
   * Run all `beforeAgent` hooks sequentially, piping the context through each.
   */
  async runBeforeAgent(context: AgentContext): Promise<AgentContext> {
    let current = context;
    for (const mw of this.middlewares) {
      if (mw.beforeAgent) {
        current = await mw.beforeAgent(current);
      }
    }
    return current;
  }

  /**
   * Run all `afterAgent` hooks sequentially.
   */
  async runAfterAgent(context: AgentContext, chunks: Chunk[]): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.afterAgent) {
        await mw.afterAgent(context, chunks);
      }
    }
  }

  /**
   * Run all `onError` hooks.
   */
  async runOnError(error: Error): Promise<void> {
    for (const mw of this.middlewares) {
      if (mw.onError) {
        await mw.onError(error);
      }
    }
  }

  /**
   * Access shared state across middleware instances.
   */
  getSharedState(): MiddlewareContext {
    return this.shared;
  }

  /**
   * Remove a middleware by name.
   */
  remove(name: string): void {
    this.middlewares = this.middlewares.filter((m) => m.name !== name);
  }

  /**
   * Get the list of registered middleware names.
   */
  list(): string[] {
    return this.middlewares.map((m) => m.name ?? "(anonymous)");
  }
}
