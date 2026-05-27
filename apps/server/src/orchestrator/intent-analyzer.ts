import type { Agent, Message } from "@agenthub/shared";
import type { SubTask, TaskDecomposition } from "./types.js";
import { buildLayers } from "./task-graph.js";

// ─── Constants ──────────────────────────────────────────────────────────

const MENTION_RE = /@(\S+?)(?:\s|$|，|。|、|\.|,)/g;

/** Sequence words that indicate dependency between tasks */
const SEQUENCE_WORDS = [
  "先", "再", "然后", "接着", "之后", "随后",
  "first", "then", "next", "after that", "subsequently",
];

/**
 * Check if text contains sequence words indicating ordered execution.
 */
function containsSequenceWord(text: string): boolean {
  return SEQUENCE_WORDS.some((word) => text.includes(word));
}

/**
 * Extract unique @mentions from message content, preserving order of appearance.
 */
export function extractMentions(content: string): string[] {
  const mentions: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  const re = new RegExp(MENTION_RE.source, "g");
  while ((match = re.exec(content)) !== null) {
    const name = (match[1]?.trim() ?? "");
    if (name && !seen.has(name)) {
      seen.add(name);
      mentions.push(name);
    }
  }

  return mentions;
}

/**
 * Resolve @mentions to actual Agent records.
 * Uses case-insensitive matching on agent name.
 */
export function resolveMentions(
  mentions: string[],
  agents: Agent[],
): Agent[] {
  const agentMap = new Map<string, Agent>();
  for (const agent of agents) {
    agentMap.set(agent.name.toLowerCase(), agent);
  }

  const resolved: Agent[] = [];
  for (const mention of mentions) {
    const agent = agentMap.get(mention.toLowerCase());
    if (agent) {
      resolved.push(agent);
    }
  }

  return resolved;
}

/**
 * Split message content into instruction fragments per agent.
 *
 * Strategy:
 * - Find each @AgentName occurrence and take the text after it until
 *   the next @AgentName or end of string as that agent's instruction.
 * - If no @ prefix is found for an agent name (e.g. just mentioned by name),
 *   assign the whole message.
 */
function assignInstructions(
  content: string,
  agents: Agent[],
): Map<string, string> {
  const instructions = new Map<string, string>();
  const agentNames = agents.map((a) => a.name);

  // Build a pattern to match any @AgentName
  const namesPattern = agentNames
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const mentionPattern = new RegExp(`@(${namesPattern})`, "g");

  // Find all mentions with their positions
  const mentions: Array<{ name: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = mentionPattern.exec(content)) !== null) {
    mentions.push({ name: (m[1] ?? ""), index: m.index });
  }

  if (mentions.length === 0) {
    // No @mentions found — each agent gets the full content
    for (const agent of agents) {
      instructions.set(agent.id, content);
    }
    return instructions;
  }

  // Assign text between mentions as instruction for the preceding agent
  for (let i = 0; i < mentions.length; i++) {
    const current = mentions[i]!;
    const next = mentions[i + 1];
    const start = current.index + current.name.length + 1; // +1 for @
    const end = next ? next.index : content.length;
    const instruction = content.slice(start, end).trim();
    instructions.set(current.name, instruction || content);
  }

  return instructions;
}

/**
 * Detect whether the message implies sequential (serial) execution
 * based on sequence words in the content.
 */
function detectExecutionOrder(
  content: string,
  agents: Agent[],
): "parallel" | "serial" {
  if (agents.length <= 1) return "serial";
  return containsSequenceWord(content) ? "serial" : "parallel";
}

/**
 * Decompose a user message into sub-tasks for each mentioned agent.
 *
 * This is the Phase 1 rule-based implementation:
 * - Extracts @mentions from message content
 * - Resolves mentions to Agent records
 * - Assigns instruction fragments
 * - Builds dependency chains based on sequence words
 *
 * @param content   - Raw user message content
 * @param agents    - Available agents in the current conversation
 * @param conversationId - Current conversation ID
 * @param parentMessageId - The user message ID (for reference)
 * @param history   - Recent conversation history messages
 * @returns TaskDecomposition with sub-tasks and layer plan
 */
export function decomposeMessage(params: {
  content: string;
  agents: Agent[];
  conversationId: string;
  parentMessageId: string;
  history?: Message[];
}): TaskDecomposition {
  const { content, agents, conversationId, parentMessageId, history } = params;

  // Extract and resolve mentions
  const mentions = extractMentions(content);
  const resolvedAgents =
    mentions.length > 0 ? resolveMentions(mentions, agents) : agents;

  if (resolvedAgents.length === 0) {
    return {
      originalMessageId: parentMessageId,
      conversationId,
      subtasks: [],
      layers: [],
    };
  }

  // Assign instruction fragments
  const instructions = assignInstructions(content, resolvedAgents);

  // Determine execution order
  const order = detectExecutionOrder(content, resolvedAgents);

  // Build context from history
  const context: { role: string; content: string }[] =
    history?.map((msg) => ({
      role: msg.senderType === "user" ? "user" : "assistant",
      content: msg.content,
    })) ?? [];

  // Create sub-tasks (first pass without dependency references)
  const subtasks: SubTask[] = resolvedAgents.map((agent) => {
    const instruction =
      instructions.get(agent.id) ??
      instructions.get(agent.name) ??
      content;

    return {
      id: `subtask_${parentMessageId}_${agent.id}`,
      parentMessageId,
      conversationId,
      agentId: agent.id,
      agentName: agent.name,
      instruction,
      dependsOn: [], // will be assigned in second pass
      context,
      status: "pending" as const,
      retryCount: 0,
    };
  });

  // Second pass: assign dependency chains (separated to avoid TDZ)
  if (order === "serial") {
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

