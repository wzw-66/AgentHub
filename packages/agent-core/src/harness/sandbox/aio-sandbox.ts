import Docker from "dockerode";
import { Writable } from "stream";
import type { Sandbox, SandboxResult } from "./types.js";
import type { DockerSandboxConfig } from "./docker-config.js";

/**
 * Container name prefix for all AgentHub sandbox containers.
 */
const CONTAINER_PREFIX = "agenthub-sandbox-";

/**
 * A Sandbox implementation backed by a Docker container.
 *
 * Uses dockerode to:
 * - Execute commands via `docker exec`
 * - Read/write files via `docker exec` (cat/tee)
 * - List directories via `docker exec` (ls)
 * - Manage container lifecycle (create, start, stop, remove)
 */
export class AioSandbox implements Sandbox {
  readonly id: string;
  private container: Docker.Container;
  private docker: Docker;

  constructor(
    docker: Docker,
    container: Docker.Container,
    containerId: string,
    _config: DockerSandboxConfig,
  ) {
    this.docker = docker;
    this.container = container;
    this.id = containerId;
  }

  /**
   * Get the underlying dockerode Container.
   */
  getContainer(): Docker.Container {
    return this.container;
  }

  async exec(command: string, args: string[] = []): Promise<SandboxResult> {
    const fullCmd = args.length > 0 ? [command, ...args] : [command];
    const exec = await this.container.exec({
      Cmd: fullCmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false, Tty: false });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    return new Promise<SandboxResult>((resolve, reject) => {
      const stdoutStream = new Writable({
        write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
          stdoutChunks.push(chunk);
          callback();
        },
      });
      const stderrStream = new Writable({
        write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
          stderrChunks.push(chunk);
          callback();
        },
      });
      this.docker.modem.demuxStream(stream, stdoutStream, stderrStream);

      const timeout = setTimeout(() => {
        reject(new Error("Command execution timed out"));
      }, 600_000); // 10 minute default per architecture doc

      stream.on("end", () => {
        clearTimeout(timeout);
        exec.inspect().then((info) => {
          resolve({
            stdout: Buffer.concat(stdoutChunks).toString("utf-8").trim(),
            stderr: Buffer.concat(stderrChunks).toString("utf-8").trim(),
            exitCode: info.ExitCode ?? 0,
          });
        }).catch(reject);
      });

      stream.on("error", (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async readFile(path: string): Promise<string> {
    const result = await this.exec("cat", [path]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file: ${path} — ${result.stderr}`);
    }
    return result.stdout;
  }

  async writeFile(path: string, content: string): Promise<void> {
    // Use printf to handle special characters safely
    const escaped = content.replace(/'/g, "'\\''");
    const escapedPath = path.replace(/'/g, "'\\''");
    const cmd = `printf '%s' '${escaped}' > '${escapedPath}'`;
    const result = await this.exec("sh", ["-c", cmd]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to write file: ${path} — ${result.stderr}`);
    }
  }

  async updateFile(_path: string, _content: Uint8Array): Promise<void> {
    // For AioSandbox, Uint8Array content would need to be base64-decoded in the container
    // This is a simplified implementation: encode as hex and use xxd to decode
    const hex = Buffer.from(_content).toString("hex");
    const escapedPath = _path.replace(/'/g, "'\\''");
    const cmd = `echo '${hex}' | xxd -r -p > '${escapedPath}'`;
    const result = await this.exec("sh", ["-c", cmd]);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to update file: ${_path} — ${result.stderr}`);
    }
  }

  async listDir(path: string = "."): Promise<string[]> {
    const result = await this.exec("ls", ["-1", path]);
    if (result.exitCode === 2) return [];
    if (result.exitCode !== 0) {
      throw new Error(`Failed to list directory: ${path} — ${result.stderr}`);
    }
    return result.stdout ? result.stdout.split("\n") : [];
  }

  /**
   * Build a dockerode HostConfig from the configuration.
   */
  static buildHostConfig(config: DockerSandboxConfig): Docker.HostConfig {
    const hostConfig: Docker.HostConfig = {
      Init: true,                       // Use tini init process for signal handling
      ReadonlyRootfs: false,
      NetworkMode: config.networkAccess === false ? "none" : "bridge",
      IpcMode: "private",
    };

    // CPU
    if (config.cpuLimit) {
      hostConfig.NanoCpus = config.cpuLimit * 1_000_000_000;
    }
    if (config.cpuSet) {
      hostConfig.CpusetCpus = config.cpuSet;
    }
    if (config.cpuShares) {
      hostConfig.CpuShares = config.cpuShares;
    }

    // Memory
    if (config.memoryLimit) {
      hostConfig.Memory = parseDockerMemory(config.memoryLimit);
    }
    if (config.memoryReservation) {
      hostConfig.MemoryReservation = parseDockerMemory(config.memoryReservation);
    }
    if (config.memorySwap !== undefined) {
      hostConfig.MemorySwap = config.memorySwap === "0"
        ? 0
        : config.memorySwap === "-1"
          ? -1
          : parseDockerMemory(config.memorySwap);
    }

    // Disk
    if (config.diskSize) {
      hostConfig.StorageOpt = { size: config.diskSize };
    }

    // Process limits
    if (config.pidsLimit) {
      hostConfig.PidsLimit = config.pidsLimit;
    }
    if (config.ulimits) {
      hostConfig.Ulimits = Object.entries(config.ulimits).map(([name, ulimit]) => ({
        Name: name,
        Soft: ulimit.soft,
        Hard: ulimit.hard,
      }));
    }

    // DNS
    if (config.dnsServers?.length) {
      hostConfig.Dns = config.dnsServers;
    }

    return hostConfig;
  }

  /**
   * Build dockerode container create config from DockerSandboxConfig.
   */
  static buildCreateConfig(
    containerName: string,
    config: DockerSandboxConfig,
  ): Docker.ContainerCreateOptions {
    return {
      name: containerName,
      Image: config.image,
      Cmd: ["sleep", "infinity"],       // Keep container alive for exec
      WorkingDir: config.workingDir,
      Env: config.envVars
        ? Object.entries(config.envVars).map(([k, v]) => `${k}=${v}`)
        : undefined,
      HostConfig: AioSandbox.buildHostConfig(config),
      Labels: {
        "agenthub-managed": "true",
        "agenthub-container-name": containerName,
      },
    };
  }

  /**
   * Create a deterministic container name from a thread ID.
   */
  static containerName(threadId: string): string {
    // Simple hash for deterministic naming (avoid crypto overhead)
    let hash = 0;
    for (let i = 0; i < threadId.length; i++) {
      const chr = threadId.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32-bit integer
    }
    const hashStr = Math.abs(hash).toString(16).slice(0, 16).padStart(16, "0");
    return `${CONTAINER_PREFIX}${hashStr}`;
  }
}

/**
 * Parse Docker memory strings like "512m", "2gb", "1024" into bytes.
 */
function parseDockerMemory(value: string): number {
  const match = value.match(/^(\d+)([kmgt]?b?)$/i);
  if (!match) return parseInt(value, 10);

  const num = parseInt(match[1]!, 10);
  const unit = match[2]?.toLowerCase() ?? "";

  switch (unit) {
    case "k":
    case "kb": return num * 1024;
    case "m":
    case "mb": return num * 1024 * 1024;
    case "g":
    case "gb": return num * 1024 * 1024 * 1024;
    case "t":
    case "tb": return num * 1024 * 1024 * 1024 * 1024;
    default: return num;
  }
}
