import type { AgentProvider } from "@agenthub/shared";
import type { AgentAdapter } from "@agenthub/shared";
import { ClaudeAdapter, type ClaudeAdapterConfig } from "./adapters/claude.adapter.js";
import { OpenCodeAdapter, type OpenCodeAdapterConfig } from "./adapters/opencode.adapter.js";
import { CustomAgentAdapter, type CustomAgentAdapterConfig } from "./adapters/custom.adapter.js";

/**
 * Create an AgentAdapter instance based on the specified provider.
 *
 * @param provider - The agent provider type (claude | opencode | custom)
 * @param config   - Provider-specific configuration
 * @returns An AgentAdapter instance
 * @throws {Error} If the provider is not recognized
 *
 * @example
 * ```ts
 * const adapter = createAdapter("claude", { cliPath: "claude" });
 * const adapter = createAdapter("opencode", { model: "anthropic/claude-sonnet-4-6" });
 * const adapter = createAdapter("custom", {
 *   endpoint: "https://api.openai.com/v1/chat/completions",
 *   apiKey: "sk-...",
 *   model: "gpt-4o",
 * });
 * ```
 */
export function createAdapter(
  provider: AgentProvider | string,
  config: Record<string, unknown> = {},
): AgentAdapter {
  switch (provider) {
    case "claude":
      return new ClaudeAdapter(config as unknown as ClaudeAdapterConfig);
    case "opencode":
      return new OpenCodeAdapter(config as unknown as OpenCodeAdapterConfig);
    case "custom":
      return new CustomAgentAdapter(config as unknown as CustomAgentAdapterConfig);
    default:
      throw new Error(
        `Unsupported agent provider: "${provider}". Expected one of: claude, opencode, custom`,
      );
  }
}
