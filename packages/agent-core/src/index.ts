// Adapters
export { ClaudeAdapter } from "./adapters/claude.adapter.js";
export { OpenCodeAdapter } from "./adapters/opencode.adapter.js";
export { CustomAgentAdapter } from "./adapters/custom.adapter.js";

// Factory
export { createAdapter } from "./factory.js";

// Utils
export {
  createChunk,
  isDoneChunk,
  parseClaudeStreamJson,
  parseOpenCodeEvent,
  parseOpenAIStreamEvent,
  parseEventLine,
  createOpenAIStreamState,
} from "./utils/chunk-parser.js";

// Harness
export { AgentHarness } from "./harness/agent-harness.js";
export type {
  HarnessConfig,
  HarnessResult,
  HarnessEvent,
  ToolHandler,
  ToolExecutionContext,
} from "./harness/types.js";

// Middleware
export type { AgentMiddleware } from "./harness/middleware/types.js";
export { MiddlewarePipeline } from "./harness/middleware/pipeline.js";
export { BlackboardMiddleware } from "./harness/middleware/blackboard.js";

// Tools
export { ToolRegistry } from "./harness/tools/registry.js";
export type { Tool, ToolHandlerFn } from "./harness/tools/types.js";

// Sandbox
export { LocalSandbox } from "./harness/sandbox/local-sandbox.js";
export { SandboxManager } from "./harness/sandbox/sandbox-provider.js";
export type { Sandbox, SandboxProvider, SandboxResult } from "./harness/sandbox/types.js";

// Compression
export { MicroCompactMiddleware } from "./harness/compression/micro-compact.js";
export { AutoCompactMiddleware } from "./harness/compression/auto-compact.js";

// Memory
export { MemoryStore } from "./harness/memory/store.js";
export { MemoryMiddleware } from "./harness/memory/memory-middleware.js";
export type { MemoryFact, MemoryClassification, MemoryConfig } from "./harness/memory/types.js";
