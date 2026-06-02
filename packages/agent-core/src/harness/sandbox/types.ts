/**
 * Sandbox abstraction for tool execution.
 *
 * A sandbox provides an isolated environment for running tool operations
 * such as file I/O, command execution, and network requests.
 */
export interface Sandbox {
  /** Execute a command in the sandbox. */
  exec(command: string, args?: string[]): Promise<SandboxResult>;
  /** Read a file from the sandbox. */
  readFile(path: string): Promise<string>;
  /** Write a file in the sandbox. */
  writeFile(path: string, content: string): Promise<void>;
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
 */
export interface SandboxProvider {
  create(): Sandbox | Promise<Sandbox>;
  destroy(sandbox: Sandbox): void | Promise<void>;
}
