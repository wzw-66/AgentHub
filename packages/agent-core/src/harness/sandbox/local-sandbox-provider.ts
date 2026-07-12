import type { Sandbox, SandboxProvider } from "./types.js";
import { LocalSandbox } from "./local-sandbox.js";

/**
 * A SandboxProvider that wraps a LocalSandbox per thread.
 *
 * Each thread gets its own LocalSandbox instance, cached by threadId.
 * Always succeeds (no fallback needed -- runs on the host).
 */
export class LocalSandboxProvider implements SandboxProvider {
  private sandboxes: Map<string, LocalSandbox> = new Map();
  private allowedDir: string;

  constructor(allowedDir: string) {
    this.allowedDir = allowedDir;
  }

  acquire(threadId: string = "default"): string {
    const id = `local-${threadId}`;
    if (!this.sandboxes.has(id)) {
      this.sandboxes.set(id, new LocalSandbox(this.allowedDir));
    }
    return id;
  }

  get(sandboxId: string): Sandbox | null {
    return this.sandboxes.get(sandboxId) ?? null;
  }

  release(sandboxId: string): void {
    this.sandboxes.delete(sandboxId);
  }

  shutdown(): void {
    this.sandboxes.clear();
  }
}
