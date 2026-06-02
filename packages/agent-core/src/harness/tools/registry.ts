import type { Sandbox } from "../sandbox/types.js";
import type { Tool, ToolHandlerFn } from "./types.js";
import type { ToolExecutionContext } from "../types.js";

/**
 * Central registry for tools available to the agent.
 *
 * Provides:
 * - Registration of tool handlers
 * - Lookup by name
 * - Built-in tools (execute_command, read_file, write_file)
 * - Optional sandbox integration
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  constructor(sandbox?: Sandbox) {
    if (sandbox) {
      this.registerBuiltins(sandbox);
    }
  }

  /**
   * Set or update the sandbox instance.
   */
  setSandbox(sandbox: Sandbox): void {
    this.registerBuiltins(sandbox);
  }

  /**
   * Register a tool.
   */
  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Register a tool by name and handler function.
   */
  registerHandler(name: string, description: string, handler: ToolHandlerFn): void {
    this.tools.set(name, { name, description, handler });
  }

  /**
   * Look up a tool by name.
   */
  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tools.
   */
  getAll(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Remove a tool.
   */
  remove(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Execute a tool by name.
   */
  async execute(
    name: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = tool.handler(args, context);
    return normalizeResult(result);
  }

  /**
   * Register built-in tools that use the sandbox.
   */
  private registerBuiltins(sandbox: Sandbox): void {
    this.register({
      name: "execute_command",
      description: "Execute a shell command",
      handler: async (args: Record<string, unknown>) => {
        const command = String(args.command ?? args.cmd ?? "");
        const cmdArgs = Array.isArray(args.args) ? args.args.map(String) : [];
        const result = await sandbox.exec(command, cmdArgs);
        return `Exit code: ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`;
      },
    });

    this.register({
      name: "read_file",
      description: "Read a file from the workspace",
      handler: async (args: Record<string, unknown>) => {
        const path = String(args.path ?? "");
        return sandbox.readFile(path);
      },
    });

    this.register({
      name: "write_file",
      description: "Write content to a file in the workspace",
      handler: async (args: Record<string, unknown>) => {
        const path = String(args.path ?? "");
        const content = String(args.content ?? "");
        await sandbox.writeFile(path, content);
        return `File written: ${path}`;
      },
    });

    this.register({
      name: "list_dir",
      description: "List files in a directory",
      handler: async (args: Record<string, unknown>) => {
        const path = String(args.path ?? ".");
        const entries = await sandbox.listDir(path);
        return entries.join("\n");
      },
    });
  }
}

async function normalizeResult(
  result: AsyncIterable<string> | Iterable<string> | Promise<string> | string,
): Promise<string> {
  if (typeof result === "string") return result;
  if (result instanceof Promise) return result;

  // AsyncIterable or Iterable
  const parts: string[] = [];
  for await (const part of result as AsyncIterable<string>) {
    parts.push(part);
  }
  return parts.join("");
}
