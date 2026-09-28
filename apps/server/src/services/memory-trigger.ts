import { extractMemories } from "@agenthub/memory";

/**
 * 进程内并发上限 —— 限制的是 LLM 调用，不是 SQLite 写。
 *
 * orchestrator 路径下每个子任务都会触发一次提取，一轮用户消息可能产生 N 次并发 LLM 调用。
 * 超出的排队，不丢弃（spec §8.7）。
 */
const MAX_CONCURRENT_EXTRACTIONS = 2;

let inFlight = 0;
const queue: Array<() => void> = [];

export function pendingExtractionCount(): number {
  return inFlight + queue.length;
}

function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT_EXTRACTIONS) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    queue.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function release(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

export interface MemoryTriggerParams {
  userId: string;
  conversationId: string;
  agentId: string;
  agentName: string;
  userMessage: string;
  agentResponse: string;
  llm: { apiKey?: string; endpoint?: string; model?: string };
  log: {
    error(obj: unknown, msg?: string): void;
    warn(obj: unknown, msg?: string): void;
  };
}

/**
 * 触发一次长期记忆提取。fire-and-forget —— 绝不阻塞调用方，绝不抛错。
 *
 * 存在的理由：两个调用点（orchestrator 的每个子任务、单 agent 路径）此前各自
 * 重复这段逻辑，且都埋在无法测试的函数内部 —— 于是「conversationId 没被传下去」
 * 这个缺陷（spec §4.7）既没有测试能发现，也没有单点可修。
 */
export function triggerMemoryExtraction(params: MemoryTriggerParams): void {
  void (async () => {
    await acquire();
    try {
      await extractMemories(
        {
          userId: params.userId,
          conversationId: params.conversationId,
          agentId: params.agentId,
          agentName: params.agentName,
          userMessage: params.userMessage,
          agentResponse: params.agentResponse,
        },
        params.llm,
      );
    } catch (err) {
      params.log.error({ err, agentId: params.agentId }, "Memory extraction failed");
    } finally {
      release();
    }
  })();
}
