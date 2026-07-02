import type { Database } from "./db.js";
import { getDatabase } from "./db.js";
import { searchMemories } from "./search.js";
import { createMemory, deleteMemory } from "./repository.js";
import type { ExtractedMemory } from "./types.js";

// ─── Prompt template ─────────────────────────────────────────────────────────

function buildPrompt(
  userMessage: string,
  agentResponse: string,
  agentName: string,
  existingMemoriesJson: string,
): string {
  return `你是一个 AI 记忆提取系统。分析以下对话，提取需要 Agent 长期记住的信息。

需要关注：
1. 用户偏好（技术栈、代码风格、沟通偏好）
2. 项目决策（架构选择、设计模式）
3. 关键事实（项目路径、API 端点、配置信息）
4. 错误模式（遇到的 bug 和修复方式）
5. 上下文信息（用户角色、技术栈、项目目标）

对每条候选记忆，与已有记忆对比后决定操作：

对话：
用户: ${userMessage}
Agent (${agentName}): ${agentResponse}

已有记忆（最近相关的 5 条）：
${existingMemoriesJson}

输出 JSON 数组，每项：
{
  "action": "add" | "update" | "delete" | "noop",
  "id": "已有记忆的 id（update/delete 时需要）",
  "type": "fact" | "preference" | "decision" | "error_pattern" | "context",
  "content": "记忆内容",
  "importance": 1-10,
  "reason": "操作原因说明"
}`;
}

// ─── LLM call ─────────────────────────────────────────────────────────────────

async function callLLM(
  prompt: string,
  llmConfig?: { apiKey?: string; endpoint?: string; model?: string },
): Promise<string> {
  const apiKey = llmConfig?.apiKey ?? process.env["API_KEY"] ?? "";
  const endpoint =
    llmConfig?.endpoint ??
    process.env["LLM_BASE_URL"]?.replace(/\/+$/, "") + "/v1/chat/completions" ??
    "https://api.deepseek.com/v1/chat/completions";
  const model = llmConfig?.model ?? process.env["LLM_MODEL"] ?? "deepseek-chat";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a memory extraction system. Respond with valid JSON only, no markdown formatting.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      return "";
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data?.choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseExtractionResponse(response: string): ExtractedMemory[] | null {
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed as ExtractedMemory[];
  } catch {
    // Try extracting from markdown code block
    const match = response.match(/```(?:json)?\s*([\s\S]*?)(```|$)/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]!.trim());
        if (Array.isArray(parsed)) return parsed as ExtractedMemory[];
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Asynchronously extract memories from a conversation turn.
 *
 * This function:
 * 1. Searches existing relevant memories
 * 2. Calls the LLM with the conversation + existing memories
 * 3. Parses the LLM response and executes add/update/delete operations
 *
 * This is designed to be called fire-and-forget (non-blocking).
 * Errors are caught internally and logged — never thrown to the caller.
 */
export async function extractMemories(
  params: {
    userId: string;
    agentId: string;
    agentName: string;
    userMessage: string;
    agentResponse: string;
  },
  llmConfig?: { apiKey?: string; endpoint?: string; model?: string },
  customDb?: Database,
): Promise<void> {
  const db = customDb || getDatabase();

  try {
    // 1. Search existing relevant memories
    const existingMemories = searchMemories(
      {
        query: params.userMessage,
        agentId: params.agentId,
        limit: 5,
      },
      db,
    );

    const existingMemoriesJson = JSON.stringify(
      existingMemories.map((m) => ({
        id: m.id,
        type: m.type,
        content: m.content,
        tags: m.tags,
        importance: m.importance,
      })),
    );

    // 2. Build and send prompt
    const prompt = buildPrompt(
      params.userMessage,
      params.agentResponse,
      params.agentName,
      existingMemoriesJson,
    );

    const response = await callLLM(prompt, llmConfig);
    if (!response) return;

    // 3. Parse response
    const operations = parseExtractionResponse(response);
    if (!operations || operations.length === 0) return;

    // 4. Execute operations
    for (const op of operations) {
      switch (op.action) {
        case "add":
          if (op.type && op.content) {
            createMemory(
              {
                userId: params.userId,
                agentId: params.agentId,
                type: op.type,
                content: op.content,
                tags: op.tags,
                importance: op.importance ?? 1,
              },
              db,
            );
          }
          break;

        case "update":
          if (op.id) {
            deleteMemory(op.id, db);
          }
          if (op.type && op.content) {
            createMemory(
              {
                userId: params.userId,
                agentId: params.agentId,
                type: op.type,
                content: op.content,
                tags: op.tags,
                importance: op.importance ?? 1,
              },
              db,
            );
          }
          break;

        case "delete":
          if (op.id) {
            deleteMemory(op.id, db);
          }
          break;

        case "noop":
          break;
      }
    }
  } catch {
    // Extraction is non-blocking; swallow all errors
  }
}
