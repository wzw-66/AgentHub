# 评测框架（Evaluation Framework）设计

> 日期：2026-09-10
> 状态：设计已确认，待写实现计划
> 目标读者：能读 TypeScript 的开发者

## 1. 概述

为 AgentHub 增加一套**离线评测框架**，用来回答一个具体问题：

> 换一个 agent、换一版 prompt、换一种编排策略，「效果」到底变好还是变差？好多少？代价是什么？

当前项目**没有任何评测能力**。最接近的是 Vitest 单元测试，但它验证的是「代码行为是否正确」，不是「agent 答得好不好」。因此目前任何技术选型（选哪个模型、哪种编排）都只能凭感觉。

本设计引入一个独立包 `packages/eval`，用**固定题库 + 固定配置矩阵**的方式批量执行、自动判分、产出对比报告。

**核心理念：换壳不换芯。** 评测框架替换掉「外壳」（HTTP 路由、数据库、SSE 推送），但保留「内核」（`AgentAdapter`、`AgentHarness`、中间件、工具）——内核是用与生产环境**完全相同的函数和同一份代码**执行的。所以评测测的是真东西，不是仿制品。

**范围定位：演示与验证导向。** 目标是跑通一个架构清晰、结果可信、可反复演示的闭环，而不是构建完备的评测平台。产品化能力（数据库、Web 界面、CI 集成）明确排除，见 §3。

## 2. 术语表

本设计的术语集中定义于此，后续章节不再重复解释。

| 术语 | 英文 | 含义 | 类比我 |
|------|------|------|--------|
| 评测集 / 数据集 | dataset | 一整套固定的测试题目 | 一套试卷 |
| 用例 | case | 其中一道题：输入 + 判分标准 | 一道题 |
| 断言 | assertion | 客观题判分规则，形如「答案里必须出现 X」，二值判定 | 标准答案 |
| 评委 | LLM judge | 主观题判分：把答案 + 评分标准交给另一个 LLM 打分 | 阅卷老师 |
| 评分标准 | rubric | 给评委的自然语言评分维度说明 | 主观题评分细则 |
| 变体 / 实验变量 | variant | 一套**钉死的**配置（agent + prompt + 编排策略 + harness 参数） | 一个考生 |
| 矩阵 | matrix | 一次实验要对比的变体清单 | 考生名单 |
| 考次 | run | 一次「某考生做某题」的完整执行记录 | 一次答题 |
| 编排策略 | strategy | agent 解题的组织方式：分解 → 执行 → 合并 | 考生的解题方法 |
| 成绩单 | report | 汇总后的对比报告 | 成绩单 |

**为什么数据集用 YAML 而不是代码？** 题目和判分标准是**数据**，不是**程序逻辑**。写成数据文件的好处：加题不用改代码；非开发者也能读懂；纳入 git 后题目变更有记录。代码只认 schema，不认具体题目。

**为什么需要「多个变体」？** 因为要做**受控实验**：一次只改一个变量，其他全部保持一致，分数差异才能归因到那一个变量上。例如：

| 变体 | provider | strategy | prompt |
|------|----------|----------|--------|
| `react` | Claude | react | 默认 |
| `dag` | Claude | dag-multi | 默认 |
| `dag-terse` | Claude | dag-multi | 精简版 |

`react` 与 `dag` 只差编排策略 → 分差归因于编排。`dag` 与 `dag-terse` 只差 prompt → 分差归因于 prompt。

## 3. 目标与非目标

### 目标

1. 提供 CLI：一条命令跑完「数据集 × 变体矩阵」，产出对比成绩单。
2. 支持对比三个维度：agent（provider/model）、prompt、编排策略。
3. 判分采用**断言（客观）+ LLM 评委（主观）**混合。
4. 支持**录制/回放**：首次真实调用并录制，之后可离线重放，秒级、确定、零成本。
5. 架构上把编排策略抽成可插拔接口，内置四种策略。
6. 评测框架自身有单元测试，且测试不依赖真实模型。

### 非目标（明确排除）

| 不做 | 理由 |
|------|------|
| 数据库表（Run/Dataset/Score） | 结果落盘为文件即可满足演示与追溯 |
| Web 评测界面 | 属于产品化，工作量是本设计的 3–5 倍 |
| 人工标注平台 | 演示阶段用不上 |
| CI 自动跑评测 | 后续可加，当前不引入 |
| 修改 `apps/server` 生产代码 | 四种策略在 `packages/eval` 内新建，生产路径不受影响 |
| 评测 HTTP/鉴权/SSE 等 Web 外壳 | 由 `apps/server` 现有测试覆盖，评测只关心 agent 能力 |

## 4. 目录结构

代码与数据分离：**代码在 `packages/eval`，数据在仓库根的 `evals/`**。加题、换变体只改数据，不动代码。

```
packages/eval/                        # 评测框架代码
├── package.json                      # @agenthub/eval，ESM + tsup
├── tsconfig.json                     # 继承 tooling/tsconfig/base.json
├── vitest.config.ts
└── src/
    ├── dataset/
    │   ├── schema.ts                 # Zod schema：EvalCase / EvalDataset / Assertion
    │   └── loader.ts                 # 读 YAML → 校验 → EvalDataset
    ├── variant/
    │   ├── schema.ts                 # Zod schema：Variant / VariantMatrix
    │   └── loader.ts                 # 读 YAML → 校验 → VariantMatrix
    ├── strategy/
    │   ├── types.ts                  # OrchestrationStrategy / StrategyContext / RunOutput
    │   ├── single.ts                 # 单 agent 单轮，无工具
    │   ├── react.ts                  # 单 agent + harness 工具循环
    │   ├── dag-multi.ts              # 分解 → DAG → 并发 → 聚合
    │   ├── debate.ts                 # 多 agent 独立作答 → 批判 → 收敛
    │   └── index.ts                  # createStrategy(id) 工厂
    ├── adapter/
    │   ├── recording-adapter.ts      # 装饰器：透传 + 落盘 fixture
    │   ├── replay-adapter.ts         # 装饰器：读 fixture 重放
    │   └── fixture-store.ts          # fixture 路径计算与读写
    ├── scorer/
    │   ├── types.ts                  # Scorer / Score
    │   ├── assertion-scorer.ts       # 断言判分（断言类型实现）
    │   ├── llm-judge-scorer.ts       # LLM 评委
    │   └── composite-scorer.ts       # 组合、加权、汇总
    ├── runner/
    │   ├── executor.ts               # 单个考次执行（构造 context、沙箱、调策略）
    │   ├── workspace.ts              # 临时工作目录：创建、播种 fixtures、清理
    │   ├── matrix.ts                 # 生成 变体 × 用例 × 重复 的执行计划
    │   └── run-eval.ts               # 顶层编排：并发控制、指标采集、存档
    ├── metrics/
    │   └── collect.ts                # 从 chunks/耗时/token 采集指标
    ├── report/
    │   ├── types.ts                  # RunRecord / VariantSummary / EvalReport
    │   ├── aggregate.ts              # 考次 → 变体维度的汇总统计
    │   ├── render-terminal.ts        # 终端表格
    │   ├── render-markdown.ts        # report.md
    │   └── render-json.ts            # report.json（完整明细）
    ├── cli.ts                        # 命令行入口
    └── index.ts                      # 公开导出

evals/                                # 评测数据（非代码）
├── datasets/
│   ├── smoke.yaml                    # 冒烟：2 题，验证链路
│   └── coding-basics.yaml            # 正式数据集，15 题
├── variants/
│   ├── smoke.yaml                    # 冒烟：2 个变体
│   └── orchestration-showdown.yaml   # 正式：4 策略对比
├── prompts/
│   └── terse.md                      # prompt 变体内容
├── fixtures/                         # 录制产物（可提交，用于回放）
│   └── <variantId>/<caseId>.jsonl
└── .runs/                            # 每次执行存档（gitignore）
    └── 2026-09-10T21-30-00/
        ├── report.md
        ├── report.json
        └── cases/<variantId>__<caseId>.json
```

## 5. 数据集格式

### 5.1 Zod Schema（`src/dataset/schema.ts`）

```typescript
const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const FixtureFileSchema = z.object({
  path: z.string(),      // 相对工作目录
  content: z.string(),
});

const AssertionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("contains"),       value: z.string(), weight: z.number().default(1) }),
  z.object({ type: z.literal("not_contains"),   value: z.string(), weight: z.number().default(1) }),
  z.object({ type: z.literal("regex"),          value: z.string(), weight: z.number().default(1) }),
  z.object({ type: z.literal("equals"),         value: z.string(), weight: z.number().default(1) }),
  z.object({ type: z.literal("json_match"),     value: z.unknown(), weight: z.number().default(1) }),
  z.object({ type: z.literal("tool_called"),    tool: z.string(),  weight: z.number().default(1) }),
  z.object({ type: z.literal("tool_not_called"),tool: z.string(),  weight: z.number().default(1) }),
  z.object({ type: z.literal("file_exists"),    path: z.string(),  weight: z.number().default(1) }),
  z.object({ type: z.literal("file_contains"),  path: z.string(), value: z.string(), weight: z.number().default(1) }),
]);

const EvalCaseSchema = z.object({
  id: z.string(),
  category: z.string(),
  tags: z.array(z.string()).default([]),
  input: z.object({
    messages: z.array(MessageSchema).min(1),
    fixtures: z.array(FixtureFileSchema).default([]),
  }),
  assertions: z.array(AssertionSchema).default([]),
  judge: z.object({
    rubric: z.string(),
    weight: z.number().default(1),
  }).optional(),
  timeoutMs: z.number().default(120_000),
});

const EvalDatasetSchema = z.object({
  name: z.string(),
  cases: z.array(EvalCaseSchema).min(1),
});
```

**关键约束**：`judge` 可选，但**每道题至少要有一个判分来源**（`assertions` 非空或 `judge` 存在）。该约束在 `loader.ts` 中作为跨字段校验强制执行，否则该题永远得分为 0 而用户不知道原因。

### 5.2 题目示例

```yaml
name: coding-basics
cases:
  - id: fizzbuzz
    category: code-generation
    tags: [easy, no-tools]
    input:
      messages:
        - role: user
          content: "用 TypeScript 实现 fizzbuzz(n)，返回字符串数组"
    assertions:
      - type: contains
        value: "FizzBuzz"
      - type: tool_called
        tool: write_file
      - type: file_contains
        path: fizzbuzz.ts
        value: "FizzBuzz"
      - type: not_contains
        value: "TODO"
    judge:
      rubric: |
        按 1-5 分评估：
        1. 逻辑正确性（3 / 5 / 15 的整除判断是否都对）
        2. 边界处理（n <= 0 是否处理）
        3. 命名与代码可读性
    timeoutMs: 120000
```

### 5.3 断言语义

所有断言作用于**该考次的最终答案文本**与**工作目录状态**，判定为二值：

| 类型 | 判定依据 |
|------|----------|
| `contains` | 最终答案文本包含 `value`（大小写敏感） |
| `not_contains` | 最终答案文本不包含 `value` |
| `regex` | 最终答案文本匹配正则 `value` |
| `equals` | 规范化（去首尾空白、统一换行、折叠连续空白）后与 `value` 完全相等 |
| `json_match` | 从答案中提取 JSON（整体解析失败则尝试提取第一个 `{...}`/`[...]`）后与 `value` 深度相等 |
| `tool_called` | 该考次过程中至少调用过一次名为 `tool` 的工具 |
| `tool_not_called` | 从未调用过名为 `tool` 的工具 |
| `file_exists` | 工作目录下存在相对路径 `path` |
| `file_contains` | 工作目录下 `path` 的内容包含 `value` |

## 6. 变体格式

### 6.1 Zod Schema（`src/variant/schema.ts`）

```typescript
const VariantSchema = z.object({
  id: z.string(),
  provider: z.enum(["Claude", "OpenCode", "Custom"]).optional(),
  model: z.string().optional(),
  strategy: z.enum(["single", "react", "dag-multi", "debate"]),
  systemPrompt: z.string().optional(),      // 内联文本
  systemPromptRef: z.string().optional(),   // 相对 evals/ 的文件路径（.md）
  overrides: z.object({
    maxTurns: z.number().optional(),
    temperature: z.number().optional(),
    middleware: z.array(z.string()).optional(),   // 覆盖默认中间件集合
    maxConcurrency: z.number().default(3),        // 策略内并发上限（dag-multi / debate）
  }).default({}),
  repeats: z.number().default(1),
});

const VariantMatrixSchema = z.object({
  name: z.string(),
  defaults: z.object({
    provider: z.enum(["Claude", "OpenCode", "Custom"]).default("Claude"),
  }).default({}),
  matrix: z.array(VariantSchema).min(1),
});
```

`systemPrompt` 与 `systemPromptRef` **互斥**，同时提供或都不提供时在 loader 中报错。`defaults.provider` 会被合入每个未显式声明 `provider` 的变体。

**`repeats` 优先级**：CLI 的 `--repeats N` 覆盖所有变体的 `repeats`；未传时使用各变体自身声明的值。一个考次的唯一标识为 `(variantId, caseId, repeatIndex)`，重复执行用于量化模型随机性带来的波动。

### 6.2 矩阵示例

```yaml
name: orchestration-showdown
defaults:
  provider: Claude
matrix:
  - id: single
    strategy: single
  - id: react
    strategy: react
  - id: dag
    strategy: dag-multi
  - id: debate
    strategy: debate
  - id: react-terse          # 与 react 只差 prompt
    strategy: react
    systemPromptRef: prompts/terse.md
    overrides:
      maxTurns: 10
```

## 7. 编排策略接口

### 7.1 接口定义（`src/strategy/types.ts`）

现状：编排逻辑写死在 `apps/server/src/orchestrator/`，只有一条流程，无法对比。本设计在 `packages/eval` 内引入可插拔接口。

```typescript
import type { AgentAdapter, AgentContext, Chunk } from "@agenthub/shared";
import type { EvalCase } from "../dataset/schema.js";

/** 策略产出的统一结果，判分器只认这个。 */
export interface RunOutput {
  /** 最终答案文本（判分作用于此） */
  text: string;
  /** 完整 chunk 序列（用于指标采集与追溯） */
  chunks: Chunk[];
  /** 策略内部的子步骤记录（可选，用于报告展示） */
  steps: RunStep[];
}

export interface RunStep {
  label: string;          // 例如 "decompose" / "subtask:2" / "critique"
  agentId: string;
  text: string;
  latencyMs: number;
}

/** 策略可用的执行环境，由 runner 注入。 */
export interface StrategyContext {
  evalCase: EvalCase;
  /** 本次考次的工作目录（已播种 fixtures） */
  workspaceDir: string;
  /** 变体配置（prompt、overrides 等） */
  variant: ResolvedVariant;
  /** 造 adapter；已包好录制/回放装饰器。传入 config 覆盖项。 */
  makeAdapter(config?: Record<string, unknown>): AgentAdapter;
  /** 造 harness；已按变体 overrides 注册好中间件。adapter 由调用方传入。 */
  makeHarness(adapter: AgentAdapter): AgentHarnessHandle;
  /** 采集过程指标（透传给 run-eval） */
  emit(event: { type: string; data?: unknown }): void;
}

export interface AgentHarnessHandle {
  use(middleware: unknown): void;
  setToolRegistry(registry: unknown): void;
  execute(context: AgentContext): AsyncIterable<Chunk>;
}

export interface OrchestrationStrategy {
  readonly id: string;
  run(ctx: StrategyContext): Promise<RunOutput>;
}
```

### 7.2 四种实现

| 策略 | 行为 | 对比价值 |
|------|------|----------|
| `single` | 直接 `adapter.execute(ctx)`，**不经过 harness**，不提供工具定义。一枪出答案。 | 下界基线：只有模型本身的能力 |
| `react` | 构造 harness，注册工具与中间件，走完整 agentic 工具循环。**与生产单 agent 路径一致。** | 工具带来的增益 |
| `dag-multi` | ① 让一个 agent 把题分解为子任务并给出依赖关系；② 按依赖拓扑分批，同批并发执行（每子任务独立 harness 调用）；③ 让一个 agent 把子结果聚合为最终答案。 | 多 agent 并发编排的增益 |
| `debate` | ① 2–3 个 agent 各自独立作答；② 一个「评审」agent 阅读全部答案并指出问题；③ 原 agent 依据批评各修订一次；④ 聚合收敛为最终答案。 | 辩论/批判式编排的增益 |

**`dag-multi` 与现有 orchestrator 的关系**：`apps/server/src/orchestrator/` 中 `task-graph.ts` 是纯函数，`intent-analyzer.ts` 仅耦合环境配置，只有 `executor.ts` 耦合 db/memory。因此 `dag-multi` **参照其算法重写**为依赖注入版本（约 200 行），**不移动、不修改生产代码**。这避免了为演示而重构生产路径的风险。

**并发上限**：`dag-multi` 与 `debate` 内的并发受 `overrides.maxConcurrency`（默认 3）限制，避免打爆 provider 限流。

### 7.3 工厂

```typescript
export function createStrategy(id: string): OrchestrationStrategy;
```

未知 id 抛出带可用 id 列表的错误。

## 8. 录制 / 回放

### 8.1 动机

LLM 输出有随机性，且真实调用慢且有成本。评测需要**可反复查看的确定性结果**。录制/回放解决这一问题。

### 8.2 机制：`AgentAdapter` 装饰器

两个装饰器都实现 `@agenthub/shared` 的 `AgentAdapter` 接口，**对上层完全透明**——`AgentHarness` 与所有策略都只看见一个普通 adapter，因此四种策略、全部中间件自动获得录制/回放能力，无需任何改动。

```typescript
// recording-adapter.ts
export class RecordingAdapter implements AgentAdapter {
  constructor(private inner: AgentAdapter, private fixturePath: string) {}

  async *execute(context: AgentContext): AsyncIterable<Chunk> {
    const frames: Chunk[] = [];
    for await (const chunk of this.inner.execute(context)) {
      frames.push(chunk);
      yield chunk;                     // 透传，不改变时序
    }
    await writeFixture(this.fixturePath, frames);   // 流结束后一次性落盘
  }

  abort(): void { this.inner.abort(); }
  // 可选方法：仅当内层实现时才委托，保持对接口的可选性
  writeStdin(text: string): void { this.inner.writeStdin?.(text); }
  healthCheck() { return this.inner.healthCheck(); }
}

// replay-adapter.ts
export class ReplayAdapter implements AgentAdapter {
  private frames: Chunk[] | null = null;

  constructor(private inner: AgentAdapter, private fixturePath: string) {}

  async *execute(_context: AgentContext): AsyncIterable<Chunk> {
    this.frames ??= await readFixture(this.fixturePath);   // 缺失则硬报错
    for (const frame of this.frames) yield frame;
  }

  abort(): void { this.inner.abort(); }
  healthCheck() { return this.inner.healthCheck(); }
}
```

**关键点**：`RecordingAdapter` 必须**边透传边收集**，不能先收集完再 yield——否则会破坏流式时序（`chunk.timestamp` 与真实耗时指标都会失真）。fixture 落盘发生在流结束后。

### 8.3 Fixture 格式与路径

- 路径：`evals/fixtures/<variantId>/<caseId>.jsonl`（`--repeats > 1` 时为 `<caseId>.r1.jsonl` 等）
- 格式：JSONL，每行一个序列化后的 `Chunk`
- **可提交 git**：fixture 是回放的数据基础，提交后他人可零成本复现相同结果

### 8.4 运行模式（CLI 开关）

| 模式 | 行为 |
|------|------|
| `--record` | 真实调用，同时写出 fixture（覆盖已有） |
| `--replay` | 只读 fixture，不调用模型。**fixture 缺失即报错退出**，提示先跑 `--record` |
| 默认 | 真实调用，不写 fixture |

## 9. 判分器

### 9.1 接口

```typescript
export interface Score {
  scorerId: string;         // "assertion:<type>" 或 "judge"
  value: number;            // 断言之和为命中权重，评委为 1-5
  max: number;              // 断言之和为总权重，评委为 5
  passed: boolean | null;   // 断言：是否全通过；评委：null
  detail: string;           // 人可读的判定说明
}

export interface Scorer {
  readonly id: string;
  score(output: RunOutput, evalCase: EvalCase, ctx: ScoreContext): Promise<Score[]>;
}
```

### 9.2 AssertionScorer

对每条断言独立判定，产出若干 `Score`。判定依据见 §5.3。`file_*` 类断言从 `ctx.workspaceDir` 读取文件状态。

### 9.3 LLMJudgeScorer

- 输入：`evalCase.judge.rubric` + `output.text`
- 模型：默认使用与变体相同的 provider，可被 `--judge-model` 覆盖
- 输出解析：要求模型返回 `{"score": <1-5>, "reason": "<string>"}`；解析失败时**重试一次**，仍失败则记 `value: null, passed: null, detail: "judge parse failure"`，**不中断整场评测**
- 走 adapter 层，因此**同样受录制/回放覆盖**（评委调用也被录制，回放时零成本）

### 9.4 CompositeScorer 与总分

综合分定义为：

```
variantScore = ( 断言通过权重和 / 断言总权重 ) × 100 × wA
             + ( 评委均分 / 5 )              × 100 × wJ
```

默认权重 `wA = 0.6, wJ = 0.4`，可通过 `--weights 0.6,0.4` 覆盖。若某题未配置 `judge`，则该题的评委维度从分母中剔除，分子分母同时缩小，避免拉低总分。

## 10. 执行流程

### 10.1 顶层流程

```
CLI 解析参数
  ↓
加载并校验 数据集 + 变体矩阵（Zod）
  ↓
生成执行计划：变体 × 用例 × repeats → 有序的考次列表
  ↓
按 --concurrency 并发执行各考次（默认 2）
  ↓
每个考次：构造 context → 建临时工作目录 → 建 adapter（含录制/回放）
         → 建 harness → 调策略 → 收集 RunOutput + 指标
  ↓
判分：断言 + 评委 → Score[]
  ↓
写存档：evals/.runs/<ts>/cases/<variantId>__<caseId>.json
  ↓
汇总：考次 → 变体维度统计 → EvalReport
  ↓
渲染：终端表格 + report.md + report.json
```

### 10.2 单个考次（`runner/executor.ts`）

这是「换壳不换芯」的落点。生产环境在 `apps/server/src/routes/messages.ts` 的 `runAgentExecution()` 中构造的 `context`，此处**构造结构完全相同的对象**：

```typescript
const context: AgentContext = {
  conversationId: `eval-${runId}-${evalCase.id}`,        // 假 ID，不落库
  message: evalCase.input.messages.at(-1)!.content,      // 题目
  history: evalCase.input.messages.slice(0, -1).map(toMessage),  // 多轮题用
  agents: [],
  systemPrompt: resolvedVariant.systemPrompt,
  tools: toolDefinitionsFor(strategyId),                 // 策略决定给不给工具
};
```

工作目录：每考次一个全新临时目录，播种 `input.fixtures` 后作为沙箱根：

```typescript
const workspaceDir = await createWorkspace(runId, evalCase.id);
await seedFixtures(workspaceDir, evalCase.input.fixtures);
```

考次结束后**无论成功失败都清理**（保留失败现场的选项见 §11）。

### 10.3 与生产环境的差异（仅三处）

| 环节 | 生产 | 评测 |
|------|------|------|
| 上下文来源 | 查数据库 | 从 YAML 构造 |
| 工作目录 | 会话的 `workspacePath` | 每次全新临时目录 |
| 输出去向 | SSE 推送给前端 | 收集为 `RunOutput` 并判分 |

**内核（`createAdapter` / `AgentHarness` / 中间件 / 工具）三处完全一致，是同一份代码。**

### 10.4 指标采集

每个考次采集：`latencyMs`、`turns`、`toolCallCount`、`inputTokens`、`outputTokens`、`estimatedCostUsd`（可选，取决于是否配置价格表）、`judgeLatencyMs`。

Token 从 `ChunkType.Done` 的 `metadata.tokenUsage` 读取（见 `packages/shared/src/types/chunk.ts`）。若 provider 未提供，则记 `null`，报告中显示 `—`，不猜测。

## 11. 错误处理与边界

| 场景 | 处理 |
|------|------|
| YAML 字段写错 / 缺字段 | 加载阶段 Zod 校验失败，**启动即报错退出**，指明文件与字段路径 |
| 用例既无 assertions 又无 judge | 加载阶段报错（§5.1 跨字段校验） |
| 单考次超时 | `case.timeoutMs` 到点调 `adapter.abort()`，记该考次为 `status: "timeout"`，**不影响其他考次** |
| 单考次抛异常 | try/catch 捕获，记 `status: "error"` + `error` 字段，继续执行后续考次 |
| 评委返回无法解析 | 重试一次，仍失败记 `null` 分并标注，不中断 |
| `--replay` 但 fixture 缺失 | 立即报错退出，提示先执行 `--record`，**不静默回退到真实调用** |
| 目录清理失败 | 记录警告，不视为考次失败 |
| provider 限流 | 受 `--concurrency` 与策略内并发上限约束；失败考次按 `status: "error"` 记录，可重跑 |

**失败可见性**：成绩单中每个变体都显示 `失败考次数 / 总考次数`。失败考次**不计入分母**，并在报告顶部醒目提示——避免「靠崩溃刷高平均分」。

## 12. 报告

### 12.1 终端表格

```
评测集: coding-basics (15 题)   本次: 2026-09-10 21:30   模式: replay

变体         综合分  通过率   评委均分  失败   平均耗时   Token    工具调用
────────────────────────────────────────────────────────────────────────────
single        56.8   53.3%      3.1     0/15    8.1s     12.4k      0.0
react         85.6   86.7%      4.2     0/15   19.5s     41.2k      3.1
dag           92.0   93.3%      4.5     0/15   31.2s     88.7k      7.4
debate        88.8   86.7%      4.6     0/15   54.0s    142.1k      9.2
```

综合分按 §9.4 的默认权重 `wA=0.6, wJ=0.4` 计算，例如 `dag = 93.3×0.6 + (4.5/5)×100×0.4 = 92.0`。

### 12.2 产物

| 文件 | 内容 |
|------|------|
| `<ts>/report.md` | 上述表格 + 逐变体分析 + 失败用例清单 |
| `<ts>/report.json` | 结构化全集：报告 + 每个考次的完整 `RunRecord` |
| `<ts>/cases/<variantId>__<caseId>.json` | 单考次明细：答案、每条断言判定、评委理由、指标 |

`--repeats > 1` 时，表格每格显示 `均值 ± 标准差`，并在 markdown 中附分布说明。

## 13. 测试策略

评测框架自身用 Vitest 测试，**全部不依赖真实模型**（用 FakeAdapter 与 FakeStrategy）。

| 测试对象 | 覆盖点 |
|----------|--------|
| `dataset/loader` | 合法 YAML 解析；非法字段报错；跨字段校验（无判分来源） |
| `variant/loader` | `systemPrompt` / `systemPromptRef` 互斥；`defaults.provider` 合并；未知 strategy 报错 |
| `assertion-scorer` | 9 种断言类型各自的通过/失败；`equals` 规范化；`json_match` 提取兜底 |
| `composite-scorer` | 加权公式；无 judge 时分母收缩 |
| `recording/replay-adapter` | fixture 往返一致；时间戳保真；缺失时报错；**装饰器不改变 chunk 序列** |
| `dag-multi` / `debate` | 用 FakeStrategy/FakeAdapter 验证拓扑分层、并发上限、聚合调用次数 |
| `workspace` | fixtures 播种、清理、隔离性 |
| `aggregate` + `render-*` | 汇总统计与报告渲染的黄金值比对 |
| `run-eval`（冒烟） | 端到端：smoke 数据集 × smoke 矩阵，用回放 fixture，断言报告结构 |

**`RecordingAdapter` 的透传性测试是重中之重**：必须断言「装饰前后的 chunk 序列完全一致」，这是整个录制机制正确性的根基。

## 14. 实施阶段

| 阶段 | 内容 | 出口标准 |
|------|------|----------|
| P0 | 包骨架、Zod schema 与加载器、`RunOutput` / `StrategyContext` 类型 | 加载器测试通过 |
| P1 | `single` + `react` 策略、`ReplayAdapter`/`RecordingAdapter`、指标采集 | 冒烟数据集可录可放 |
| P2 | 断言判分器 + 组合判分 + 报告渲染 | smoke 数据集端到端出成绩单 |
| P3 | `dag-multi` + `debate` 策略、LLM 评委 | 4 策略对比跑通 |
| P4 | 正式数据集（15 题）+ 正式矩阵 + 结果解读文档 | 产出可用于演示的对比报告 |

每阶段结束都应可运行、有测试。

## 15. 交付物

1. `packages/eval` 完整实现（含单元测试）。
2. `evals/` 下 smoke 与正式数据集、变体矩阵、prompt 变体。
3. `evals/fixtures/` 录制产物（提交，支持零成本回放）。
4. 一份结果解读文档（`docs/` 下），说明如何用成绩单做技术选型。
