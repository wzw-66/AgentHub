/**
 * Sandbox abstraction for tool execution.
 *
 * A sandbox provides an isolated environment for running tool operations
 * such as file I/O, command execution, and network requests.
 */
export interface Sandbox {
  /** Unique identifier for this sandbox instance. */
  readonly id: string;
  /** Execute a command in the sandbox. */
  exec(command: string, args?: string[]): Promise<SandboxResult>;
  /** Read a file from the sandbox. */
  readFile(path: string): Promise<string>;
  /** Write a file in the sandbox. */
  writeFile(path: string, content: string): Promise<void>;
  /** Write binary content to a file in the sandbox. */
  updateFile(path: string, content: Uint8Array): Promise<void>;
  /** List directory contents. */
  listDir(path: string): Promise<string[]>;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Factory that provides sandbox instances.
 *
 * Lifecycle: acquire -> use (get) -> release -> shutdown (global)
 * acquire returns a deterministic sandbox ID for the given thread.
 */
export interface SandboxProvider {
  /** Acquire a sandbox -- returns the sandbox ID. */
  acquire(threadId?: string): string | Promise<string>;
  /** Get a sandbox by ID. Returns null if not found. */
  get(sandboxId: string): Sandbox | null | Promise<Sandbox | null>;
  /** Release a sandbox by ID. */
  release(sandboxId: string): void | Promise<void>;
  /** Shut down all sandboxes (optional -- app exit). */
  shutdown?(): void | Promise<void>;
}
