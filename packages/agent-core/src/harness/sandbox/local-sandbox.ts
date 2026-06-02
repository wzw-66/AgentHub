import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, normalize, relative } from "node:path";
import type { Sandbox, SandboxResult } from "./types.js";

/**
 * A local sandbox that executes commands and file operations on the host machine.
 *
 * Features:
 * - Path traversal protection (blocks paths outside `allowedDir`)
 * - Subprocess execution with timeout
 * - Synchronous operations for simplicity
 */
export class LocalSandbox implements Sandbox {
  private allowedDir: string;

  constructor(allowedDir: string) {
    this.allowedDir = resolve(allowedDir);
  }

  async exec(command: string, args: string[] = []): Promise<SandboxResult> {
    const fullCommand = [command, ...args].join(" ");
    try {
      const stdout = execSync(fullCommand, {
        cwd: this.allowedDir,
        timeout: 30_000,
        encoding: "utf-8",
      });
      return { stdout: stdout.trim(), stderr: "", exitCode: 0 };
    } catch (err: unknown) {
      if (err instanceof Error && "stdout" in err && "stderr" in err) {
        const execErr = err as { stdout: string; stderr: string; status?: number };
        return {
          stdout: (execErr.stdout ?? "").toString().trim(),
          stderr: (execErr.stderr ?? "").toString().trim(),
          exitCode: execErr.status ?? 1,
        };
      }
      return {
        stdout: "",
        stderr: err instanceof Error ? err.message : "Command execution failed",
        exitCode: 1,
      };
    }
  }

  async readFile(path: string): Promise<string> {
    const safePath = this.resolvePath(path);
    return readFileSync(safePath, "utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    const safePath = this.resolvePath(path);
    writeFileSync(safePath, content, "utf-8");
  }

  async listDir(path: string = "."): Promise<string[]> {
    const safePath = this.resolvePath(path);
    if (!existsSync(safePath)) {
      return [];
    }
    return readdirSync(safePath);
  }

  /**
   * Resolve the path and guard against traversal attacks.
   */
  private resolvePath(inputPath: string): string {
    const resolved = resolve(this.allowedDir, normalize(inputPath));
    const rel = relative(this.allowedDir, resolved);
    if (rel.startsWith("..") || (rel.length === 1 && rel === ".")) {
      // Allow the root dir itself
      if (resolved !== this.allowedDir) {
        throw new Error(`Path traversal denied: ${inputPath} resolves outside allowed directory`);
      }
    }
    return resolved;
  }
}
