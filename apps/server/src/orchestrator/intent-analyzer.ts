import type { Agent, Message } from "@agenthub/shared";
import type { SubTask, TaskDecomposition } from "./types.js";
import { buildLayers } from "./task-graph.js";
import { config } from "../config/env.js";

// ─── Types ──────────────────────────────────────────────────────────

export interface LLMIntentResult {
  intent: string;
  assignedAgents: Array<{
    agentId: string;
    instruction: string;
  }>;
  order: "parallel" | "serial";
  summary: string;
}

export interface LLMIntentAnalyzerOptions {
  /** Timeout in ms for the LLM API call. Default: 15000 */
  timeout?: number;
  /** Maximum retries on failure. Default: 1 */
  maxRetries?: number;
}

// ─── LLM Intent Analyzer ────────────────────────────────────────────

export class LLMIntentAnalyzer {
  private apiKey: string | undefined;
  private endpoint: string;
  private model: string;

  constructor(
    private options: LLMIntentAnalyzerOptions = {},
  ) {
    this.apiKey = config.llm.apiKey;
    this.endpoint = config.llm.endpoint;
    this.model = config.llm.model;
  }

  /**
   * Analyze a user message and determine which agents should handle it
   * and what instructions they should receive.
   *
   * @param content - Raw user message
   * @param agents  - Available agents in the conversation
   * @returns LLMIntentResult with task assignments, or null if no agents needed
   */
  async analyze(
    content: string,
    agents: Agent[],
  ): Promise<LLMIntentResult | null> {
    if (!this.apiKey) {
      // No API key configured — fallback to assigning all agents
      return this.fallbackResult(content, agents);
    }

    if (agents.length === 0) return null;

    const prompt = this.buildPrompt(content, agents);
    const timeout = this.options.timeout ?? 15000;
    const maxRetries = this.options.maxRetries ?? 1;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.callLLM(prompt, timeout);
        if (result && result.assignedAgents.length > 0) {
          return result;
        }
        // LLM returned no agents — message doesn't need orchestration
        if (result && result.assignedAgents.length === 0) {
          return null;
        }
      } catch (err) {
        if (attempt < maxRetries) continue;
        // Fallback: assign all agents
        return this.fallbackResult(content, agents);
      }
    }

    return this.fallbackResult(content, agents);
  }

  /**
   * Build the system prompt for LLM intent analysis.
   */
  private buildPrompt(content: string, agents: Agent[]): Array<{ role: string; content: string }> {
    const agentList = agents.map((a) =>
      `- ID: ${a.id} | Name: ${a.name}${a.systemPrompt ? ` | Role: ${a.systemPrompt}` : ""}`
    ).join("\n");

    return [
      {
        role: "system",
        content: [
          "You are an intent analyzer for a multi-agent collaboration platform. The current conversation has the following agents:",
          "",
          agentList,
          "",
          "Analyze the user's message and determine:",
          "1. Which agents should participate in the task (use their ID, not name)",
          "2. What specific instruction each agent should receive",
          "3. Whether agents should execute in parallel or serial order",
          "4. A brief summary of the overall intent",
          "",
          "RULES:",
          "- If the user @mentions an agent name or role, find the matching agent ID from the list above",
          "- If the user doesn't @mention anyone, infer the appropriate agents from the message content",
          "- Only assign agents that are relevant to the task. If the message is a greeting or casual chat, return empty assignedAgents",
          "- Instructions must be specific and actionable in Chinese",
          "- Use \"serial\" order when tasks have dependencies (e.g., design before implementation)",
          "- Use \"parallel\" order when tasks are independent",
          "",
          'You MUST respond with valid JSON using EXACTLY these field names:',
          '{',
          '  "intent": "Brief description of the user intent",',
          '  "assignedAgents": [',
          '    { "agentId": "THE_EXACT_ID_FROM_THE_LIST_ABOVE", "instruction": "Instruction in Chinese" }',
          '  ],',
          '  "order": "serial" or "parallel",',
          '  "summary": "Brief execution plan summary"',
          '}',
          "",
          "IMPORTANT: The \"agentId\" field MUST contain the exact ID string from the list, NOT the agent name.",
        ].join("\n"),
      },
      {
        role: "user",
        content,
      },
    ];
  }

  /**
   * Call the LLM API with the prompt.
   */
  private async callLLM(
    prompt: Array<{ role: string; content: string }>,
    timeout: number,
  ): Promise<LLMIntentResult | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: prompt,
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }

      const body = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      const raw = body.choices?.[0]?.message?.content;
      if (!raw) {
        throw new Error("Empty LLM response");
      }

      const parsed = this.parseResponse(raw);

      return parsed;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse the LLM JSON response into a structured result.
   * Accepts both the canonical field names and common LLM variations.
   */
  private parseResponse(raw: string): LLMIntentResult | null {
    try {
      const parsed = JSON.parse(raw) as LLMIntentResult & {
        executionOrder?: string;
        assignedAgents?: Array<{ agentId?: string; agentName?: string; instruction?: string }>;
      };

      // Validate required fields
      if (!Array.isArray(parsed.assignedAgents)) {
        return null;
      }

      // Accept entries with either agentId or agentName (defensive)
      const filteredAgents = parsed.assignedAgents.filter(
        (a) => (Boolean(a.agentId) || Boolean(a.agentName)) && Boolean(a.instruction),
      );

      // Accept both "order" and "executionOrder" field names
      const order = parsed.order === "serial"
        ? "serial"
        : parsed.executionOrder === "serial"
          ? "serial"
          : "parallel";

      return {
        intent: parsed.intent ?? "",
        assignedAgents: filteredAgents.map((a) => ({
          agentId: a.agentId ?? a.agentName ?? "",
          instruction: a.instruction ?? "",
        })),
        order,
        summary: parsed.summary ?? "",
      };
    } catch {
      return null;
    }
  }

  /**
   * Fallback result: assign all agents in parallel with the original message as instruction.
   */
  private fallbackResult(
    content: string,
    agents: Agent[],
  ): LLMIntentResult {
    return {
      intent: "fallback",
      assignedAgents: agents.map((a) => ({
        agentId: a.id,
        instruction: content,
      })),
      order: "parallel",
      summary: "",
    };
  }
}

// ─── Decompose Message ─────────────────────────────────────────────

/**
 * Decompose a user message into sub-tasks using LLM intent analysis.
 *
 * @param content   - Raw user message content
 * @param agents    - Available agents in the current conversation
 * @param conversationId - Current conversation ID
 * @param parentMessageId - The user message ID (for reference)
 * @param history   - Recent conversation history messages
 * @returns TaskDecomposition with sub-tasks and layer plan
 */
export async function decomposeMessage(params: {
  content: string;
  agents: Agent[];
  conversationId: string;
  parentMessageId: string;
  history?: Message[];
  analyzer?: LLMIntentAnalyzer;
}): Promise<TaskDecomposition> {
  const {
    content,
    agents,
    conversationId,
    parentMessageId,
    history,
    analyzer,
  } = params;

  if (agents.length === 0) {
    return {
      originalMessageId: parentMessageId,
      conversationId,
      subtasks: [],
      layers: [],
    };
  }

  // Run LLM intent analysis
  const intentAnalyzer = analyzer ?? new LLMIntentAnalyzer();
  const result = await intentAnalyzer.analyze(content, agents);

  // LLM determined no agents needed (greeting, etc.)
  if (!result || result.assignedAgents.length === 0) {
    return {
      originalMessageId: parentMessageId,
      conversationId,
      subtasks: [],
      layers: [],
    };
  }

  // Build context from history
  const context: { role: string; content: string }[] =
    history?.map((msg) => ({
      role: msg.senderType === "user" ? "user" : "assistant",
      content: msg.content,
    })) ?? [];

  // Build agent lookup map
  const agentMap = new Map<string, Agent>();
  for (const agent of agents) {
    agentMap.set(agent.id, agent);
  }

  // Create sub-tasks from LLM result
  const subtasks: SubTask[] = [];

  for (const assignment of result.assignedAgents) {
    // Try to find agent by ID first, then fall back to name matching
    let agent = agentMap.get(assignment.agentId);
    if (!agent) {
      agent = agents.find((a) => a.name === assignment.agentId);
    }
    if (!agent) continue;

    subtasks.push({
      id: `subtask_${parentMessageId}_${agent.id}`,
      parentMessageId,
      conversationId,
      agentId: agent.id,
      agentName: agent.name,
      instruction: assignment.instruction,
      dependsOn: [],
      context,
      status: "pending" as const,
      retryCount: 0,
    });
  }

  // Set dependency chain for serial execution
  if (result.order === "serial") {
    for (let i = 1; i < subtasks.length; i++) {
      const prev = subtasks[i - 1];
      if (prev) {
        subtasks[i]!.dependsOn = [prev.id];
      }
    }
  }

  // Build layers from DAG
  const layers = buildLayers(subtasks);

  return {
    originalMessageId: parentMessageId,
    conversationId,
    subtasks,
    layers,
  };
}
