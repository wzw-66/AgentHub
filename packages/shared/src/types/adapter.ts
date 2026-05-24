import type { AgentContext } from "./chunk.js";
import type { Chunk } from "./chunk.js";
import type { HealthStatus } from "./common.js";

export interface AgentAdapter {
  execute(context: AgentContext): AsyncIterable<Chunk>;
  abort(): void;
  healthCheck(): Promise<HealthStatus>;
}
