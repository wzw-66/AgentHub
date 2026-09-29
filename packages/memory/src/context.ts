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
 * 已知偏差：中文的字符/token 比远低于英文（一个汉字常常就是一个 token），所以对
 * 纯中文记忆这是**低估**，且量级不小 —— 按 4 字符/token 估，一段纯汉字正文的实际
 * token 数约为估算值的 **4 倍**：默认 800 的预算，最坏情况下真正注入的约 3200 token。
 * 方向是安全的（只会偏多，不会偏少），但别把这当成噪声：要收紧就得换估算方式或调低
 * 默认预算，而不是指望它「差不多」。
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

    // 「检索到 0 条」与「检索到了、但第一条就超预算」都返回 `undefined`，调用方
    // 看不出区别 —— 而这正是本项目反复栽的那类静默失效（一条过大的记忆会把这一轮
    // 的**全部**记忆一起压掉）。所以两者必须在日志里长得不一样。
    if (memories.length > 0 && lines.length === 0) {
      console.warn(
        `[memory] ${memories.length} memory(ies) matched but none fit tokenBudget=${budget}` +
          ` (the top memory alone estimates at ${estimateTokens(
            `[Memory - ${memories[0]!.type}] ${memories[0]!.content}`,
          )}); injecting nothing this turn`,
      );
    }

    return lines.length > 0 ? lines.join("\n\n") : undefined;
  } catch (err) {
    console.error("[memory] buildMemoryContext failed, proceeding without memories:", err);
    return undefined;
  }
}
