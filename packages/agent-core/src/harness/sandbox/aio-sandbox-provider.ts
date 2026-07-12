import Docker from "dockerode";
import type { Sandbox, SandboxProvider } from "./types.js";
import type { DockerSandboxConfig } from "./docker-config.js";
import { DEFAULT_DOCKER_CONFIG } from "./docker-config.js";
import { AioSandbox } from "./aio-sandbox.js";

/**
 * Default idle timeout for Docker containers (10 minutes in ms).
 */
const DEFAULT_IDLE_TIMEOUT_MS = 600_000;

/**
 * How long to wait for a container to stop gracefully before SIGKILL (ms).
 */
const DEFAULT_STOP_TIMEOUT_MS = 10_000;

/**
 * A SandboxProvider that manages Docker containers via dockerode.
 *
 * Lifecycle:
 * 1. acquire(threadId) → creates/runs container, returns deterministic ID
 * 2. get(sandboxId) → returns cached AioSandbox
 * 3. release(sandboxId) → removes container
 * 4. shutdown() → removes all containers
 */
export class AioSandboxProvider implements SandboxProvider {
  private docker: Docker;
  private sandboxes: Map<string, AioSandbox> = new Map();
  private idleTimers: Map<string, NodeJS.Timeout> = new Map();
  private config: DockerSandboxConfig;
  private state: "active" | "shutting_down" | "shut_down" = "active";

  constructor(config: Partial<DockerSandboxConfig> = {}) {
    this.config = { ...DEFAULT_DOCKER_CONFIG, ...config };
    this.docker = new Docker();
  }

  async acquire(threadId: string = "default"): Promise<string> {
    if (this.state !== "active") {
      throw new Error("AioSandboxProvider is shutting down or shut down");
    }

    const sandboxId = AioSandbox.containerName(threadId);

    // Check if we already have this sandbox cached
    const existing = this.sandboxes.get(sandboxId);
    if (existing) {
      this.refreshIdleTimer(sandboxId);
      return sandboxId;
    }

    // Check if container already exists (crash recovery)
    const containers = await this.docker.listContainers({
      all: true,
      filters: { name: [sandboxId] },
    });

    let container: Docker.Container;
    if (containers.length > 0) {
      const info = containers[0]!;
      container = this.docker.getContainer(info.Id);
      if (info.State !== "running") {
        await container.remove();
        container = await this.createContainer(sandboxId);
      }
    } else {
      container = await this.createContainer(sandboxId);
    }

    const sandbox = new AioSandbox(this.docker, container, sandboxId, this.config);
    this.sandboxes.set(sandboxId, sandbox);
    this.refreshIdleTimer(sandboxId);

    return sandboxId;
  }

  get(sandboxId: string): Sandbox | null {
    return this.sandboxes.get(sandboxId) ?? null;
  }

  async release(sandboxId: string): Promise<void> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) return;

    this.clearIdleTimer(sandboxId);
    this.sandboxes.delete(sandboxId);

    try {
      const container = (sandbox as AioSandbox).getContainer();
      const stopTimeout = this.config.containerStopTimeout ?? DEFAULT_STOP_TIMEOUT_MS;
      await container.stop({ t: Math.ceil(stopTimeout / 1000) });
      await container.remove({ v: true });
    } catch {
      // Container might already be gone — ignore
    }
  }

  async shutdown(): Promise<void> {
    this.state = "shutting_down";

    // Clear all idle timers
    for (const [id] of this.idleTimers) {
      this.clearIdleTimer(id);
    }

    // Release all sandboxes in parallel
    const releasePromises: Promise<void>[] = [];
    for (const [id] of this.sandboxes) {
      releasePromises.push(this.release(id).catch(() => {}));
    }
    await Promise.all(releasePromises);

    this.state = "shut_down";
  }

  /**
   * Get the underlying dockerode Docker instance.
   */
  getDocker(): Docker {
    return this.docker;
  }

  /**
   * Get the counts of active/idle containers for diagnostics.
   */
  getStats(): { active: number; idleTimeout: number } {
    return {
      active: this.sandboxes.size,
      idleTimeout: this.config.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async createContainer(sandboxId: string): Promise<Docker.Container> {
    const createConfig = AioSandbox.buildCreateConfig(sandboxId, this.config);

    // Pull image if needed
    if (this.config.imagePullPolicy === "Always") {
      await this.pullImage();
    } else if (this.config.imagePullPolicy === "IfNotPresent") {
      try {
        const image = this.docker.getImage(this.config.image);
        await image.inspect();
      } catch {
        await this.pullImage();
      }
    } else if (this.config.imagePullPolicy === "Never") {
      try {
        const image = this.docker.getImage(this.config.image);
        await image.inspect();
      } catch {
        throw new Error(
          `Image "${this.config.image}" not found locally and imagePullPolicy is "Never"`,
        );
      }
    }

    const container = await this.docker.createContainer(createConfig);
    await container.start();
    return container;
  }

  private async pullImage(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.docker.pull(this.config.image, {}, (err: Error | null, stream?: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }
        if (!stream) {
          resolve();
          return;
        }
        this.docker.modem.followProgress(stream, (pullErr: Error | null) => {
          if (pullErr) reject(pullErr);
          else resolve();
        });
      });
    });
  }

  private refreshIdleTimer(sandboxId: string): void {
    this.clearIdleTimer(sandboxId);

    const timeout = this.config.idleTimeout ?? DEFAULT_IDLE_TIMEOUT_MS;
    if (timeout <= 0) return; // No idle timeout

    this.idleTimers.set(
      sandboxId,
      setTimeout(() => {
        // Timer fires — release the sandbox if still cached
        this.release(sandboxId).catch(() => {});
      }, timeout),
    );
  }

  private clearIdleTimer(sandboxId: string): void {
    const timer = this.idleTimers.get(sandboxId);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(sandboxId);
    }
  }
}
