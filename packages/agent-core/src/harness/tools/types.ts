import type { ToolExecutionContext } from "../types.js";

/**
 * A tool definition as known to the registry.
 */
export interface Tool {
  name: string;
  description: string;
  handler: ToolHandlerFn;
}

/**
 * Function signature for a tool handler.
 */
export type ToolHandlerFn = (
  args: Record<string, unknown>,
  context: ToolExecutionContext,
) => AsyncIterable<string> | Iterable<string> | Promise<string> | string;
