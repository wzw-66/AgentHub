import type { Database } from "./db.js";
import { searchMemories } from "./search.js";

/** 默认 token 预算（spec §8.7）。 */
const DEFAULT_TOKEN_BUDGET = 800;

/**
 * 条数硬上界。
 *
 * 预算不是唯一的上限：一批短事实可以在预算内塞进**很多**条，而每条都会带一个
 * 类型标签（`[Memory - fact] `），注入块的开销并不只由正文字数决定。条数上界
 * 同时也是检索的 `limit` —— 取回 200 条再在 JS 里截断是白做 200 条的工作。
 */
const MAX_MEMORIES = 20;

/** token 与字符的粗略换算比例。 */
const CHARS_PER_TOKEN = 4;

/**
 * 粗粒度 token 估算：约 4 字符 / token。
 *
 * 刻意不引入 tokenizer 依赖：这里只需要一个能挡住「5 条长记忆吃掉上下文」的
 * 上限（spec §8.7），精度不重要。真正的收敛点还是 `tokenBudget` 这个参数本身，
 * 换掉这个函数的估算方式不会改变接口。
 *
 * 已知偏差：中文的字符/token 比低于英文（一个汉字常常就是一个 token），所以对
 * 中文记忆这是**低估**。方向是安全的 —— 低估只会让注入比预算略多，而预算本就是
 * 一个数量级上的护栏，不是硬配额。
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * 检索本会话的记忆并渲染成可注入 `systemPrompt` 的文本块。
 *
 * 供 orchestrator 与单 agent 两条路径共用 —— 两条路径此前各写一份拼接逻辑，
 * 单 agent 那份干脆漏掉了记忆注入（spec §4.2、§8.7）。一份实现才谈得上路径一致。
 *
 * **不收 `agentId`** —— 按 spec §1.1，检索作用域是**会话**，`agentId` 已降级为
 * 记忆的元数据（`listMessages` 本就按会话共享历史，记忆的边界必须与它相同）。
 * 想加 `agentId` 的话先回去读 §1.1：这是设计决定，不是漏了。
 *
 * **绝不抛错** —— 记忆是提示，不是必需条件。但降级必须可观察，所以走日志。
 *
 * @returns 渲染好的文本块；没有任何条目塞得下时返回 `undefined`
 *   （而不是空字符串 —— 调用方用 `if (block)` 判断，空串会被拼出一个空段落）。
 */
export async function buildMemoryContext(params: {
  userId: string;
  conversationId: string;
  query: string;
  /** 默认 800。按 token 预算截断而非固定条数 —— 5 条长记忆与 5 条短事实的开销差一个数量级。 */
  tokenBudget?: number;
  customDb?: Database;
}): Promise<string | undefined> {
  const budget = params.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  try {
    const memories = await searchMemories(
      {
        query: params.query,
        userId: params.userId,
        scope: { conversationId: params.conversationId },
        limit: MAX_MEMORIES,
      },
      params.customDb,
    );

    const lines: string[] = [];
    let used = 0;

    // 检索结果已按相关度排序，所以「下一条塞不下」就是停止点，不是跳过点 ——
    // 继续往后找小的条目会把低相关度的记忆排到高相关度的前面。
    for (const memory of memories) {
      const line = `[Memory - ${memory.type}] ${memory.content}`;
      const cost = estimateTokens(line);
      if (used + cost > budget) break;
      lines.push(line);
      used += cost;
    }

    return lines.length > 0 ? lines.join("\n\n") : undefined;
  } catch (err) {
    console.error("[memory] buildMemoryContext failed, proceeding without memories:", err);
    return undefined;
  }
}
