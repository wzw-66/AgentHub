# 沙箱架构设计

沙箱（Sandbox）是 AgentHub 中**安全执行环境**的抽象层，为 Agent 的工具操作（命令执行、文件读写、目录遍历）提供隔离、受控的执行上下文。

## Status

- **Status:** Complete (revised 2026-07-12, added container lifecycle & resource limits sections)
- **Date:** 2026-06-07
- **Branch:** dev
- **Package:** `@agenthub/agent-core/src/harness/sandbox/`
- **Related docs:** [`sandbox-image-selection.md`](./sandbox-image-selection.md) — 容器镜像选型调研

## 一、架构概览

### 核心抽象

```
                    ┌──────────────────────┐
                    │    AgentHarness       │
                    │    ToolRegistry       │
                    └─────────┬────────────┘
                              │ 工具执行
                              ▼
              ┌───────────────────────────────┐
              │        Sandbox (interface)     │
              │  ┌─────────┐ ┌───────────────┐ │
              │  │ exec()  │ │ readFile()    │ │
              │  │         │ │ writeFile()   │ │
              │  │         │ │ listDir()     │ │
              │  └─────────┘ └───────────────┘ │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │    FallbackSandboxProvider         │
              │    (降级编排层)                     │
              │    ┌──── mode ──────────────────┐  │
              │    │  strict → 失败即报错        │  │
              │    │  warn   → 降级 + 日志警告    │  │
              │    │  force  → 强制走本地沙箱    │  │
              │    └────────────────────────────┘  │
              └───────────────┬───────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │         ┌──────────┐          │
              │  优先尝试 ▼          │           │
              │  ┌───────────┐  ┌───────────┐  │
              │  │ AioSandbox│  │LocalSandbox│  │
              │  │ (Docker)  │  │(降级兜底)  │  │
              │  └─────┬─────┘  └─────┬─────┘  │
              │        │              │         │
              │  完全容器隔离     路径白名单保护   │
              └────────────────────────────────┘
```

### 架构层次

| 层 | 组件 | 职责 |
|----|------|------|
| **接口层** | `Sandbox` interface | 统一的操作抽象 |
| **提供者** | `SandboxProvider` interface | 沙箱实例的工厂与生命周期管理 |
| **管理器** | `SandboxManager` | 全局单例管理、缓存、优雅关闭 |
| **具体实现** | `LocalSandbox` / `AioSandbox` | 不同后端的实际执行 |
| **降级编排** | `FallbackSandboxProvider` | 主后端降级逻辑、沙箱来源追踪 |
| **安全感知** | `SandboxType` 元数据注入 | Agent 和 API 可感知当前沙箱隔离等级 |

---

## 二、核心接口

### Sandbox 接口

```typescript
interface Sandbox {
  readonly id: string;                     // 唯一标识
  exec(command: string, args?: string[]): Promise<SandboxResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, append?: boolean): Promise<void>;
  updateFile(path: string, content: Uint8Array): Promise<void>;
  listDir(path: string, maxDepth?: number): Promise<string[]>;
}

interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

| 方法 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `exec` | `command` + `args[]` | `SandboxResult` | 执行 shell 命令，返回标准输出/错误/退出码 |
| `readFile` | `path` | `string` | 读取文件内容 |
| `writeFile` | `path` + `content` + `append?` | `void` | 写入文件内容，支持追加模式 |
| `updateFile` | `path` + `content` | `void` | 写入二进制文件内容 |
| `listDir` | `path` + `maxDepth?` | `string[]` | 列出目录条目，支持最大深度 |

### SandboxProvider 接口

沙箱实例的工厂模式，负责沙箱的全生命周期管理：

```typescript
interface SandboxProvider {
  acquire(threadId?: string): string | Promise<string>;   // 获取沙箱 → 返回沙箱 ID
  get(sandboxId: string): Sandbox | null | Promise<Sandbox | null>;  // 按 ID 获取
  release(sandboxId: string): void | Promise<void>;       // 释放沙箱
  shutdown?(): void | Promise<void>;                      // 优雅关闭全部（可选）
}
```

| 方法 | 语义 | 说明 |
|------|------|------|
| `acquire` | 获取一个沙箱 | 本地模式直接返回默认沙箱；Docker 模式启动容器 |
| `get` | 按 ID 获取已有沙箱 | 用于子代理复用父线程的沙箱 |
| `release` | 释放单个沙箱 | 本地模式无操作；Docker 模式停止容器 |
| `shutdown` | 关闭所有沙箱 | 应用退出时调用，清理所有资源 |

### 全局单例模式

```typescript
// 获取全局沙箱提供者（基于配置自动创建）
const provider = getSandboxProvider();

// 测试时注入 Mock
setSandboxProvider(mockProvider);

// 应用关闭时清理
shutdownSandboxProvider();
```

**为什么需要 Provider + 全局单例？**

| 后端 | acquire 语义 | shutdown 行为 |
|------|-------------|---------------|
| LocalSandboxProvider | 返回固定 `"default"` ID（直接创建） | 无操作 |
| AioSandboxProvider | 创建 Docker 容器，返回容器 ID | 停止所有容器 |
| FallbackSandboxProvider | 优先尝试 AioSandbox → 按模式处理降级 | 代理给实际使用的后端 |

### SandboxManager（可选包装）

提供缓存层和生命周期管理的便利包装：

```typescript
class SandboxManager {
  setProvider(provider: SandboxProvider): void;
  getSandbox(id?: string): Promise<Sandbox>;      // 获取（带缓存）
  destroySandbox(id?: string): Promise<void>;      // 销毁单个
  destroyAll(): Promise<void>;                     // 销毁全部
}
```

**缓存策略：** 按 `id` 缓存沙箱实例，默认 `"default"`。同一 id 多次 `getSandbox()` 返回同一实例。

---

## 三、LocalSandbox 实现

`LocalSandbox` 是 AioSandbox（Docker）不可用时的**降级兜底实现**，运行在宿主机上，通过路径白名单等安全约束保障执行安全。同时也可用于本地开发等不需要容器隔离的场景。

### 安全模型

```
Agent 工具调用
    │
    ▼
┌──────────────────────────────────┐
│  ToolRegistry 收到工具执行请求      │
│  execute_command / read_file / 等 │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│  LocalSandbox                     │
│                                  │
│  ┌────────────────────────────┐  │
│  │  路径解析                   │  │
│  │  resolvePath(inputPath)    │  │
│  │  ┌──────────────────┐     │  │
│  │  │ normalize 规范化 │     │  │
│  │  │ resolve 绝对路径 │     │  │
│  │  │ relative 相对值  │     │  │
│  │  │ 越界检测         │     │  │
│  │  └──────────────────┘     │  │
│  └────────────┬───────────────┘  │
│               │                   │
│  ┌────────────▼──────────────┐   │
│  │  安全 ← 是否越界？ → 拒绝  │   │
│  └────────────┬──────────────┘   │
│               ▼                   │
│  ┌────────────────────────────┐  │
│  │  执行操作                   │  │
│  │  - execSync (600s 超时)    │  │
│  │  - readFileSync            │  │
│  │  - writeFileSync           │  │
│  │  - readdirSync             │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

### 路径遍历防护

```typescript
// LocalSandbox.resolvePath()
private resolvePath(inputPath: string): string {
  const resolved = resolve(this.allowedDir, normalize(inputPath));
  const rel = relative(this.allowedDir, resolved);

  // 检测是否越界
  if (rel.startsWith("..") || (rel.length === 1 && rel === ".")) {
    if (resolved !== this.allowedDir) {
      throw new Error(`Path traversal denied: ${inputPath}`);
    }
  }
  return resolved;
}
```

| 输入 | resolved | allowedDir | 相对路径 | 结果 |
|------|----------|------------|----------|------|
| `src/index.ts` | `/workspace/src/index.ts` | `/workspace` | `src/index.ts` | ✅ 允许 |
| `../../../etc/passwd` | `/etc/passwd` | `/workspace` | `../../../etc/passwd` | ❌ 拒绝 |
| `.` | `/workspace` | `/workspace` | `.` | ✅ 允许（根目录自身） |

### 虚拟路径映射

LocalSandbox 支持虚拟路径与容器路径之间的双向映射：

```typescript
// 路径映射：容器路径 ←→ 本地路径
private resolvePath(inputPath: string): string {
  // 正向：将输入路径映射为本地绝对路径
  const resolved = resolve(this.allowedDir, normalize(inputPath));
  // ... 越界检测
}

private reverseResolvePath(localPath: string): string {
  // 反向：将输出中的本地路径映射回容器路径
  // 工具输出中的路径对模型更友好
}
```

### 命令执行安全

| 防护措施 | 实现 | 配置 |
|----------|------|------|
| **工作目录锁定** | `cwd: this.allowedDir` | 构造函数传入 |
| **超时保护** | `timeout: 600_000ms`（600 秒） | 可配置 |
| **输出截断** | 由调用方控制 | 无自动截断 |

---

## 四、AioSandboxProvider（Docker 容器沙箱）

AioSandboxProvider 提供基于 Docker/OCI 容器的完全隔离执行环境，是生产环境的**首选沙箱后端**。FallbackSandboxProvider 优先尝试该实现，不可用时才触发降级逻辑。

### 架构

```
AioSandboxProvider
    │
    ├── 三层一致性
    │   ├── 进程内缓存（Map<id, Sandbox>）
    │   ├── 跨进程状态存储（文件/共享内存）
    │   └── 后端发现（Docker API）
    │
    ├── 确定性沙箱 ID
    │   └── SHA256(thread_id) → 沙箱标识
    │
    ├── 空闲超时管理
    │   ├── 默认 600 秒空闲超时
    │   ├── 后台检查线程（定期扫描）
    │   └── 超时自动释放容器
    │
    └── 优雅关闭
        ├── SIGTERM 处理
        ├── SIGINT 处理
        └── atexit 注册清理
```

### 容器配置

```typescript
interface DockerSandboxConfig {
  image: string;                    // 容器镜像（如 "docker/sandbox-templates:shell"）
  workingDir: string;               // 工作目录（sandbox-templates 默认 /home/agent/workspace）
  envVars: Record<string, string>;  // 环境变量

  // ── 资源限制 ──
  memoryLimit: string;              // 内存硬限制（如 "512m"）
  memoryReservation: string;        // 内存软限制（如 "256m"），宿主机压力时优先回收
  memorySwap: string;               // 交换分区上限（如 "256m"，"-1" 为无限制，"0" 为禁用）
  cpuLimit: number;                 // CPU 核心数（如 1）
  cpuSet: string;                   // CPU 亲和性（如 "0-3"），隔离敏感操作到专用核心
  cpuShares: number;                // CPU 相对权重（默认 1024），竞争时分配比例
  diskSize: string;                 // 根文件系统磁盘配额（如 "2gb"）
  pidsLimit: number;                // 最大进程数（如 100），防止 fork bomb
  ulimits: Record<string, Ulimit>;  // 自定义 ulimit（如 nofile: {soft: 1024, hard: 2048}，nproc 等）
  ioReadBps: string;                // 磁盘读速率上限（如 "50mb"）
  ioWriteBps: string;               // 磁盘写速率上限（如 "30mb"）
  ioReadIops: number;               // 磁盘读 IOPS 上限
  ioWriteIops: number;              // 磁盘写 IOPS 上限

  // ── 网络策略 ──
  networkAccess: boolean;           // 网络访问策略（boolean 开关）
  networkRules: NetworkRule[];      // 精细网络规则（域名/IP/端口级别白名单）
  dnsServers: string[];             // 自定义 DNS（如 ["8.8.8.8", "1.1.1.1"]）
  proxyConfig: ProxyConfig;         // 代理配置（HTTP_PROXY/HTTPS_NO_PROXY）

  // ── 生命周期 ——
  idleTimeout: number;              // 空闲超时（ms，默认 600000）
  containerStopTimeout: number;     // 容器停止等待时间（ms，默认 10000）
  imagePullPolicy: ImagePullPolicy; // 镜像拉取策略（Always / IfNotPresent / Never）
}

interface Ulimit {
  soft: number;
  hard: number;
}

interface NetworkRule {
  direction: "egress" | "ingress";
  ip: string;                       // 目标 IP 或 CIDR（如 "0.0.0.0/0"）
  port: number;                     // 端口（如 443，443-5000，*）
  protocol: "tcp" | "udp" | "any";
  action: "allow" | "deny";
}

interface ProxyConfig {
  httpProxy: string;                // HTTP_PROXY URL
  httpsProxy: string;               // HTTPS_PROXY URL
  noProxy: string;                  // NO_PROXY 逗号分隔列表
}

type ImagePullPolicy = "Always" | "IfNotPresent" | "Never";
```

**设计说明：**

- `memoryLimit` 和 `memoryReservation` 构成双水位策略：硬限制确保单个容器不会拖垮宿主机，软限制让 Docker 在宿主机内存压力时优先回收
- `cpuSet` 专用于"噪声隔离"——将计算密集型 Agent 绑定到专用核心，避免竞争 L1/L2 缓存
- `ulimits` 可配置 `nofile`（文件描述符）、`nproc`（用户进程数）、`stack`（栈大小）等，默认继承容器 init 进程的 ulimit 值
- `ioReadBps` / `ioWriteBps` 防止单个容器的磁盘 I/O 影响其他容器和关键系统进程
- `networkRules` 支持域名/IP 级别的出站白名单，`dnsServers` 配合代理确保内部仓库的域名解析不被污染
- `imagePullPolicy` 默认为 `IfNotPresent`；`Always` 用于 CI/CD 确保每次使用最新镜像；`Never` 用于离线环境

### 镜像选型

AioSandbox 选用的容器镜像为 **Docker 官方 sandbox-templates**，镜像选择 [`docker/sandbox-templates:shell`](https://docs.docker.com/ai/sandboxes/customize/templates/)。

**镜像信息：**

| 项目 | 说明 |
|------|------|
| **镜像** | `docker/sandbox-templates:shell` |
| **大小** | ~385 MB |
| **基座** | Ubuntu |
| **默认用户** | `agent` (UID 1000) |
| **默认工作目录** | `/home/agent/workspace` |

**预装工具：**

```
Node.js / Python 3 / Go / Java
Git + GitHub CLI (gh) / ripgrep / jq
curl / wget / ca-certificates
```

**选择理由：** 业界标准 AI Agent 沙箱镜像，Docker Inc. 官方维护，预装 Agent 常用多语言运行时和开发工具，非 root 用户开箱即用，与 Docker Sandboxes 微 VM 产品兼容。

详细选型调研见 [`sandbox-image-selection.md`](./sandbox-image-selection.md)。

### 与 LocalSandbox 的对比

| 特性 | LocalSandbox | AioSandbox |
|------|-------------|------------|
| 隔离级别 | 进程级 | 容器级 |
| 路径安全 | 白名单检测 | 容器文件系统天然隔离 |
| 资源限制 | 无 | CPU/内存限制 |
| 网络策略 | 宿主机网络 | 可配置（隔离/受限/开放） |
| 启动开销 | 无 | 秒级（容器创建） |
| 适用环境 | 开发 | 生产 |

### 容器生命周期管理

AioSandbox 的容器生命周期包含从创建到销毁的完整状态机，覆盖创建、复用、空闲回收、崩溃恢复和优雅关闭等场景。

#### 状态机

```
                         ┌──────────┐
                         │  不存在   │
                         └────┬─────┘
                    create()  │
                         ┌────▼─────┐           ┌──────────┐
                         │  创建中    │─────错误──→│  创建失败  │
                         └────┬─────┘           └──────────┘
                    Docker    │
                    API 完成  │
                         ┌────▼─────┐
                         │  运行中    │ ←── acquire() / exec()
                         └────┬─────┘
                    idleTimeout │
                    触发       │
                         ┌────▼─────┐
                         │  空闲待回收 │ ←── 后台扫描标记
                         └────┬─────┘
                    destroy() │  或 release()
                         ┌────▼─────┐
                         │  销毁中    │ ←── Docker stop/rm
                         └────┬─────┘
                              │
                         ┌────▼─────┐
                         │  已销毁    │ → 不存在
                         └──────────┘
```

**状态说明：**

| 状态 | 说明 | 超时时间 |
|------|------|---------|
| 创建中 | Docker API 调用（pull+create+start）进行中 | 120s（pull 超时） |
| 运行中 | 容器正常运行，可接受 exec | 无上限 |
| 空闲待回收 | 超过 `idleTimeout` 无活动，等待后台清理 | `idleTimeout`+10s |
| 创建失败 | pull/create 过程中出错，已被清理 | 即时转化到"不存在" |
| 销毁中 | Docker stop + rm 进行中 | `containerStopTimeout` |
| 已销毁 | 资源已释放 | 终止态 |

#### 创建流程

```
acquire(threadId)
    │
    ├── 1. SHA256(threadId) → sandboxId
    │
    ├── 2. 检查进程内缓存
    │       ├── 命中 → 返回缓存 Sandbox 实例
    │       └── 未命中 → 继续
    │
    ├── 3. 后端发现（Docker API health check）
    │
    ├── 4. 镜像拉取（按 imagePullPolicy）
    │       ├── IfNotPresent + 本地存在 → 跳过
    │       ├── IfNotPresent + 本地不存在 → docker pull
    │       ├── Always → docker pull
    │       └── Never + 本地不存在 → 抛错
    │
    ├── 5. 检查同名容器残留
    │       ├── docker inspect sandbox-{sandboxId}
    │       ├── 存在且运行中 → 复用（可能来自前一次崩溃或同一进程的线程重连）
    │       ├── 存在但已停止 → docker rm + 重新创建
    │       └── 不存在 → 正常创建
    │
    ├── 6. docker create（配置资源限制、安全选项、网络策略）
    ├── 7. docker start
    └── 8. 注册空闲超时计时器 → 返回 Sandbox 实例
```

#### 容器命名与 ID 策略

```typescript
// 确定性容器名：prefix + SHA256(thread_id)[:16]
const CONTAINER_PREFIX = "agenthub-sandbox-";
const containerName = `${CONTAINER_PREFIX}${sha256(threadId).slice(0, 16)}`;
```

- 容器名使用 16 字符 SHA256 摘要（8×10¹⁹ 空间，冲突概率可忽略）
- 前缀 `agenthub-sandbox-` 使 `docker ps --filter name=agenthub-sandbox-` 可快速筛选所有托管容器
- 复用检测：`acquire` 时 `docker ps -a --filter name=${containerName}` 检查是否有相同 threadId 的存活容器

#### 空闲超时管理

```typescript
class IdleTimer {
  private timers: Map<string, NodeJS.Timeout> = new Map();

  // 每次 exec/readFile/writeFile 后调用 → 重置超时
  refresh(sandboxId: string): void {
    this.clear(sandboxId);
    this.timers.set(sandboxId, setTimeout(() => {
      this.destroyContainer(sandboxId);
    }, config.idleTimeout));
  }

  // 优雅关闭前清除
  destroy(): void {
    for (const [id] of this.timers) this.clear(id);
  }
}
```

| 策略 | 说明 |
|------|------|
| **重置时机** | 每次 `exec` / `readFile` / `writeFile` 完成后刷新计时器 |
| **检查周期** | `idleTimeout / 4`（默认 600s → 每 150s 扫一次） |
| **Timer 精度** | Node.js `setTimeout` 实现，非周期性扫描线程，避免空转 |
| **超时动作** | → 标记"空闲待回收" → 执行 `docker stop -t 10` → `docker rm` |
| **同 ID 重新 acquire** | 容器已销毁 → 重新走创建流程（此时会拉新镜像） |
| **临界保护** | `refresh()` 和 `destroyContainer()` 之间用 Mutex 防止并发释放 |
| **进程崩溃保护** | Timer 随进程销毁。Node.js 重启后启动时扫描孤儿容器统一清理 |

#### 崩溃恢复和启动清理

```typescript
// 在 AioSandboxProvider 初始化时调用
async function recoverOrphanContainers(): Promise<void> {
  // 1. 列出所有 tag=agenthub-managed 的容器
  const orphans = await docker.listContainers({
    all: true,
    filters: { label: ["agenthub-managed=true"] },
  });

  for (const container of orphans) {
    // 2. 清理策略：停止超过 30m 的孤儿
    const created = new Date(container.Created);
    const age = Date.now() - created.getTime();

    if (age > 30 * 60 * 1000 || container.State === "exited") {
      // 超过 30 分钟或已退出的 → 直接清理
      await killContainer(container.Id);
      await removeContainer(container.Id);
      log(`Cleaned up orphan sandbox container: ${container.Id}`);
    } else {
      // 创建时间 < 30m 且仍在运行 → 可能来自同一进程的热重启
      // 保留并尝试纳入管理
      this.reviveContainer(container.Id);
    }
  }
}
```

**标签标记：** 每个 AioSandbox 容器创建时自动添加 Docker label：

```
--label agenthub-managed=true
--label agenthub-thread-id={sha256(threadId)}
```

这些标签在生产中用于：
1. **启动清理**：快速筛选出所有 AgentHub 托管的容器
2. **监控告警**：Prometheus 按 label 聚合沙箱资源使用
3. **运维排查**：`docker ps --filter label=agenthub-thread-id=xxx` 快速定位特定会话的容器

#### 容器销毁流程

```
destroy(sandboxId)
    │
    ├── 1. 取消空闲计时器
    ├── 2. docker stop -t {containerStopTimeout}
    │       ├── 容器正常退出（exit 0） → 继续
    │       └── 超时未响应 → docker kill（SIGKILL）
    ├── 3. docker rm -v（删除容器 + 匿名卷）
    ├── 4. 从缓存中移除
    └── 5. 记录销毁事件到日志
```

**优雅关闭全流程（应用退出时）：**

```
shutdownSandboxProvider()
    │
    ├── 1. 标记状态 "shutting_down" → 拒绝新的 acquire()
    ├── 2. 并行遍历所有活跃沙箱
    │       ├── 每个执行 destroy(sandboxId)
    │       └── 聚合超时：整体等待 30s × containerStopTimeout
    ├── 3. 停止空闲计时器后台线程
    ├── 4. 关闭 Docker API 连接（如使用 TCP）
    └── 5. 标记状态 "shut_down"
```

### 资源限制体系

AioSandbox 通过 Docker 的 cgroup v2 机制实施多维资源限制。限制在容器创建时通过 `HostConfig` 设定，运行中不可变（如需变更需重建容器）。

#### 限制维度总览

| 维度 | Docker HostConfig 字段 | 默认值 | 说明 |
|------|------------------------|--------|------|
| **CPU 核心数** | `NanoCpus` | 1 核 | 硬限制，容器 CPU 使用不会超过此值 |
| **CPU 权重** | `CpuShares` | 1024 | 竞争时按权重分配；非竞争时忽略 |
| **CPU 亲和性** | `CpusetCpus` | 空（不限制） | 绑定到指定物理核心，隔离噪声 |
| **内存上限** | `Memory` | 512 MB | 硬限制，超限触发 OOM Kill |
| **内存软限制** | `MemoryReservation` | 256 MB | 宿主机压力时优先从此容器回收 |
| **交换分区** | `MemorySwap` | `Memory × 2` | `-1` 无限制 `0` 禁用 |
| **磁盘根分区** | `StorageOpt.size` | 2 GB | overlay2 的容器可写层大小 |
| **最大进程数** | `PidsLimit` | 100 | 防 fork bomb |
| **文件描述符** | `Ulimits.nofile` | soft: 1024, hard: 2048 | 防 FD 泄漏 |
| **读速率** | `BlkioDeviceReadBps` | 无限制 | 磁盘顺序读限速 |
| **写速率** | `BlkioDeviceWriteBps` | 无限制 | 磁盘随机写限速 |
| **读 IOPS** | `BlkioDeviceReadIOps` | 无限制 | 小文件读限速 |
| **写 IOPS** | `BlkioDeviceWriteIOps` | 无限制 | 小文件写限速 |

#### 默认配置模板

```yaml
sandbox:
  provider:
    type: "aio"
    config:
      # CPU
      cpuLimit: 1                          # 1 核 CPU
      cpuShares: 1024                      # 默认权重
      # cpuSet: "0-1"                      # 可选：绑定到前两个核心

      # 内存
      memoryLimit: "512m"                  # 硬限制 512MB
      memoryReservation: "256m"            # 软限制 256MB
      memorySwap: "256m"                   # 交换上限 256MB

      # 磁盘
      diskSize: "2gb"                      # 容器层 2GB

      # 进程
      pidsLimit: 100                       # 最多 100 个进程
      ulimits:
        nofile: { soft: 1024, hard: 2048 } # 文件描述符
        nproc: { soft: 100, hard: 200 }    # 用户进程数

      # I/O
      ioReadBps: "50mb"                    # 读限速 50MB/s
      ioWriteBps: "30mb"                   # 写限速 30MB/s
```

#### 安全限制的配置组合

不同场景的资源限制策略：

| 场景 | CPU | 内存 | 进程 | I/O | 说明 |
|------|-----|------|------|-----|------|
| **编译构建** | 4 核 + cpuset | 2GB + 1GB swap | 200 | 100MB/s | 构建任务需要更多资源 |
| **代码搜索/读取** | 0.5 核 | 256MB + 无 swap | 30 | 不受限 | 轻量操作，降低延迟更重要 |
| **Agent 全功能** | 1 核 (默认) | 512MB + 256MB swap | 100 | 50MB/s | 默认配置，均衡策略 |
| **安全敏感操作** | 1 核 (cpuset 隔离) | 256MB，无 swap | 30 | 10MB/s | 限制最严，最小攻击面 |
| **不可信代码执行** | 0.5 核 | 128MB，swap=0 | 10 | 5MB/s | 执行用户提交的不确定代码 |

#### OOM 行为

```
容器内存超限
    │
    ├── 超出 memoryReservation（但 < memoryLimit）
    │       └── 宿主机内存压力 → Docker 优先 kill 此容器
    │       无内存压力 → 正常运行
    │
    └── 超出 memoryLimit
            └── 内核 OOM Killer 选择此容器 → 容器 exit code 137 → AioSandbox 捕获
                ├── 记录 OOM 事件到日志（含 cgroup 内存统计）
                ├── 将 OOM 信息以 stderr 形式返回给 Agent
                └── 销毁此容器 → Agent 在下一次 acquire 获取新容器
```

#### 与降级的交互

| 降级模式 | 降级后后端 | 资源限制行为 |
|---------|-----------|-------------|
| `strict` | 不降级 | N/A |
| `warn` | LocalSandbox | ❌ 所有 Docker 资源限制失效，agent 通过 system prompt 感知 |
| `force` | LocalSandbox | ❌ 同上 |

### 信号处理与优雅关闭

AioSandbox 的信号处理覆盖三个层面：**Agent abort**（单个命令取消）、**应用关闭**（进程退出）、**Docker 异常**（daemon 重启/连接断开）。

#### Agent abort 信号链

当 Agent 通过 `AgentAdapter.abort()` 取消正在执行的操作时，需要将取消信号传递到容器内运行的进程：

```
Agent 请求 abort
    │
    ▼
AgentHarness.abort()
    │
    ▼
AioSandbox.abort(sandboxId)
    │
    ├── Phase 1: docker exec 进程的 SIGTERM
    │       └── docker exec -t（带 TTY）→ Ctrl+C 等效 → 容器内进程收到 SIGINT
    │       或 docker exec（无 TTY）→ 通过 docker kill <exec-id> 终止
    │
    ├── 等待 5s
    │
    ├── Phase 2: 若进程未退出 → docker exec -t → 发送 SIGKILL
    │
    └── 返回 SandboxResult（exitCode = -1, stdout="", stderr="[aborted]"）
```

**关键约束：**

| 约束 | 说明 |
|------|------|
| 无 TTY 的 exec | `docker exec`（无 `-t`）不分配伪终端，进程不注册信号处理器。此时需通过 `docker exec` API 终止 exec session 来中断进程 |
| 带 TTY 的 exec | `docker exec -t` 分配伪终端，Ctrl+C 等效 → 容器内进程收到 SIGINT。但部分程序（如 `npm install`）忽略 SIGINT |
| 强制终止 | `docker kill <containerId>` 会杀死整个容器而非单个进程。应避免用于单个命令取消 |
| **推荐方案** | 使用 `docker exec` API 的 `ExecResize` 发送 Ctrl+C 序列 + 超时 watch 进程组 |

**abort 后容器状态：** 单个命令取消不影响容器本身。容器继续运行，后续 exec 正常执行。

#### 容器停止的超时策略

```
docker stop -t {containerStopTimeout} containerId
    │
    ├── 0-2s: 发送 SIGTERM → 容器内 PID 1 进程
    │
    ├── 2-10s: 等待容器内 init 进程转发信号并优雅退出
    │       ├── 正常退出 → 返回 exit code
    │       └── 超时未退出 → 内核发送 SIGKILL
    │
    └── 强制 kill → 容器瞬间终止，exit code -1
```

| `containerStopTimeout` | 行为 | 适用场景 |
|------------------------|------|---------|
| 5s（默认） | 快速关闭 | 空闲超时回收、普通容器销毁 |
| 30s | 宽容关闭 | 容器内有长时间运行的保存操作（如正在写文件） |
| 0s | 跳过 SIGTERM，直接 SIGKILL | 紧急关闭、安全隔离、资源抢占 |

#### 应用关闭顺序

```
SIGTERM/SIGINT 到达 Node.js 进程
    │
    ├── 1. AgentHarness 收到系统信号
    │       ├── 拒绝新的 ToolCall 处理
    │       └── 等待当前 ToolCall 完成（最多 30s）
    │
    ├── 2. SandboxManager.destroyAll()
    │       ├── 并行：shutdownSandboxProvider()
    │       │       每个容器执行 docker stop -t 10 → docker rm
    │       └── 整体超时：30 秒硬限制
    │
    ├── 3. 清理临时文件（如 mounted workspace）
    │
    └── 4. 记录关闭事件 → 进程退出
```

#### 从异常断开恢复

| 异常场景 | 检测方式 | 恢复行为 |
|---------|---------|---------|
| Docker daemon 重启 | Docker API 调用返回 `ECONNREFUSED` / `socket hang up` | 重试最多 3 次（指数退避 1s/3s/9s）；失败后触发 FallbackSandboxProvider 降级 |
| exec 过程中连接中断 | stream `error` / `close` 事件 | 已执行部分输出保留；标记本次 exec 结果为部分失败（stderr: connection lost） |
| 容器被外部 `docker rm` | 下次 exec 返回 `404 No such container` | 容器标记为 destroyed → 下次 acquire 重新创建 |
| OOM 容器 | exit code 137 | 记录 OOM → 销毁旧容器 → 创建新容器（同一 thread_id） |

---

## 五、FallbackSandboxProvider（降级编排）

FallbackSandboxProvider 是 AioSandbox 和 LocalSandbox 之间的**降级编排层**。它不是独立的沙箱后端，而是包装两个底层 Provider，在 AioSandbox 不可用时自动降级到 LocalSandbox。

### 架构

```
FallbackSandboxProvider
    │
    ├── 双 Provider 持有
    │   ├── primary: AioSandboxProvider     （优先）
    │   └── fallback: LocalSandboxProvider   （降级）
    │
    ├── 沙箱来源追踪
    │   └── Map<SandboxId, "docker" | "local">
    │       └── destroy() 时根据来源选择正确的清理逻辑
    │
    ├── 三种降级模式
    │   ├── strict → AioSandbox 不可用直接报错
    │   ├── warn   → 降级到 LocalSandbox + 日志警告
    │   └── force  → 即使 AioSandbox 可用也使用 LocalSandbox
    │
    └── 沙箱类型注入
        └── 将当前沙箱类型（docker/local）注入到 AgentContext
            └── Agent 通过 system prompt 感知隔离级别
```

### 降级模式配置

```yaml
sandbox:
  provider:
    type: "aio"                        # 首选后端
    config:
      image: "docker/sandbox-templates:shell"   # Docker 官方 sandbox 镜像
      memoryLimit: "512m"
      cpuLimit: 1
  fallback:
    mode: "warn"                        # strict | warn | force
    # mode: "strict"                    # 生产环境推荐，Docker 不可用则拒绝执行
    # mode: "force"                     # 调试时跳过 Docker，直接走本地
```

| 模式 | 行为 | 安全级别 | 适用场景 |
|------|------|---------|---------|
| `strict` | AioSandbox 创建失败 → 抛出错误，请求终止 | Docker 级 | 生产环境、安全敏感操作 |
| `warn` | AioSandbox 创建失败 → 降级到 LocalSandbox + `console.warn` | 降级到进程级 | 本地开发、CI 环境 |
| `force` | 跳过 AioSandbox，直接使用 LocalSandbox | 进程级 | 调试 AioSandbox 本身、无 Docker 环境 |

### 沙箱来源追踪

由于 FallbackSandboxProvider 管理两类沙箱，`destroy()` 需要根据沙箱来源分别处理：

```typescript
class FallbackSandboxProvider implements SandboxProvider {
  private primary: SandboxProvider;     // AioSandboxProvider
  private fallback: SandboxProvider;    // LocalSandboxProvider
  private sandboxOrigin: Map<string, "docker" | "local"> = new Map();

  async create(): Promise<Sandbox> {
    try {
      const sandbox = await this.primary.create();
      this.sandboxOrigin.set(sandbox.id, "docker");
      return sandbox;
    } catch (err) {
      if (this.mode === "strict") throw err;
      const sandbox = this.fallback.create();
      this.sandboxOrigin.set(sandbox.id, "local");
      console.warn(`AioSandbox unavailable (${err.message}), falling back to LocalSandbox`);
      return sandbox;
    }
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    const origin = this.sandboxOrigin.get(sandbox.id);
    if (origin === "docker") {
      await this.primary.destroy(sandbox);
    }
    // local → no-op, garbage collected
  }
}
```

### 沙箱类型感知

FallbackSandboxProvider 将当前沙箱类型元数据注入到 `AgentContext` 中，Agent 可通过 system prompt 感知自己运行在什么隔离级别下：

```
┌──────────────────────────────────────────┐
│  当前沙箱类型: docker（完全容器隔离）      │
│  - 文件系统与宿主机隔离                   │
│  - CPU/内存受 cgroup 限制                 │
│  - 网络策略: 受限访问                     │
└──────────────────────────────────────────┘

或

┌──────────────────────────────────────────┐
│  当前沙箱类型: local（进程级隔离）        │
│  ⚠️ 降级模式 — 仅路径白名单保护           │
│  - 无 CPU/内存限制                        │
│  - 无网络隔离                             │
│  - 请避免高风险操作                       │
└──────────────────────────────────────────┘
```

---

## 六、SandboxMiddleware（中间件集成）

SandboxMiddleware 是 AgentHarness 中间件管道中的一环，负责沙箱的惰性/积极获取：

```typescript
// 注册到中间件管道
const harness = new AgentHarness(adapter);
harness.use(new SandboxMiddleware({ lazyInit: true }));
```

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| `lazyInit: true`（默认） | 首次工具调用时自动 `acquire` | 非工具密集型场景、不确定是否需要沙箱 |
| `lazyInit: false` | `beforeAgent()` 立即 `acquire` | 工具密集型场景、确定需要沙箱 |

**关键设计：**
- 同一线程（conversation）内复用同一沙箱实例
- 子代理通过 `thread_id` 共享父级沙箱 ID
- 沙箱在 `SandboxProvider.shutdown()` 时统一清理
- `lazy_init` 避免不必要的沙箱创建开销

**与降级的交互：**
- 降级发生在 `acquire` 阶段（此时触发 FallbackSandboxProvider 的 `create()`）
- `lazyInit: true` 意味着降级被推迟到首次工具调用时才发生
- `lazyInit: false` 意味着在 Agent 开始执行前就确定沙箱类型
- 无论哪种模式，**一个会话内沙箱类型一旦确定不会中途切换**
- 沙箱类型通过 SandboxMiddleware 注入到 `AgentContext`，Agent 可通过 system prompt 感知

---

## 七、与 ToolRegistry 的集成

Sandbox 与 ToolRegistry 的绑定关系。**实际使用中通过 FallbackSandboxProvider 获取沙箱**，而不是直接实例化：

```typescript
// 通过 FallbackSandboxProvider 获取沙箱（自动处理降级）
const provider = getSandboxProvider();  // FallbackSandboxProvider 实例
const sandbox = await provider.create();
const toolRegistry = new ToolRegistry(sandbox);

// 也可通过 SandboxManager 统一管理
const manager = new SandboxManager(provider);
const sandbox = await manager.getSandbox("default");
const toolRegistry = new ToolRegistry(sandbox);

// ToolRegistry 构造函数中自动注册 5 个内置工具
// - execute_command  → sandbox.exec()
// - read_file       → sandbox.readFile()
// - write_file      → sandbox.writeFile()
// - update_file     → sandbox.updateFile()
// - list_dir        → sandbox.listDir()
```

### ToolExecutionContext 中的沙箱传递

```typescript
interface ToolExecutionContext {
  conversationId: string;
  sandbox?: Sandbox;  // 可选的沙箱引用
}
```

当 AgentHarness 执行工具时，将 sandbox 传递给 ToolExecutionContext，使得自定义 ToolHandler 也能使用沙箱。

---

## 八、数据流

### 文件操作数据流

```
用户: "读取 src/index.ts 的内容"
    │
    ▼
AgentHarness.startTurn()
    │
    ▼
AgentAdapter.execute() → ToolCall("read_file", {path: "src/index.ts"})
    │
    ▼
AgentHarness.processToolCalls()
    │
    ▼
ToolRegistry.execute("read_file", args, context)
    │
    ▼
LocalSandbox.readFile("src/index.ts")
    │  │
    │  ├─ resolvePath("src/index.ts") → /workspace/src/index.ts ✅
    │  └─ readFileSync("/workspace/src/index.ts", "utf-8")
    │
    ▼
返回内容 → 注入 toolMessages → 下一轮执行
```

### 命令执行数据流

```
用户: "运行 npm test"
    │
    ▼
AgentHarness → ToolCall("execute_command", {command: "npm", args: ["test"]})
    │
    ▼
LocalSandbox.exec("npm", ["test"])
    │  │
    │  ├─ 工作目录: /workspace（allowedDir）
    │  ├─ 超时: 600 秒
    │  └─ 同步执行（execSync）
    │
    ▼
返回 {stdout, stderr, exitCode}
```

### Docker 沙箱执行流

```
用户: "编译项目"
    │
    ▼
AgentHarness → SandboxMiddleware.beforeAgent()
    │
    ▼
AioSandboxProvider.acquire(threadId)
    │  ├─ SHA256(threadId) → sandboxId
    │  ├─ Docker API: 创建容器（若不存在）
    │  └─ 返回 sandboxId
    │
    ▼
ToolRegistry.execute("execute_command", ...)
    │
    ▼
AioSandbox.exec("npm run build")
    │  ├─ Docker exec: 在容器内执行
    │  ├─ 资源限制: CPU 1核, 内存 512MB
    │  └─ 超时: 600s
    │
    ▼
返回结果 → AioSandboxProvider 空闲计时器重置
          → 后台检查线程监控空闲超时
```

### Fallback 沙箱获取流

```
用户: "编译项目"
    │
    ▼
AgentHarness → SandboxMiddleware.beforeAgent()
    │
    ▼
FallbackSandboxProvider.create()
    │
    ├── 尝试 AioSandboxProvider.create()
    │    │
    │    ├── Docker 可用
    │    │   ├─ SHA256(threadId) → sandboxId
    │    │   ├─ Docker API: 创建容器
    │    │   └─ 标记来源: "docker" ✅
    │    │
    │    └── Docker 不可用
    │        │
    │        ├── mode = "strict" → 抛出异常 ❌
    │        │
    │        └── mode = "warn"
    │            ├─ console.warn("AioSandbox unavailable, falling back...")
    │            ├─ LocalSandboxProvider.create()
    │            ├─ 标记来源: "local" ⚠️
    │            └─ 注入沙箱类型到 AgentContext
    │
    ▼
ToolRegistry.execute("execute_command", ...)
    │
    ├── 来源为 docker → 容器内执行
    │
    └── 来源为 local → 宿主机执行（路径白名单）
```

---

## 九、与 Harness 的关系

Sandbox 是 AgentHarness 的可选组件。两者独立，但组合使用：

```
AgentHarness ─── has ───→ Middleware Pipeline
     │
     ├─── has ───→ ToolRegistry ─── uses ───→ Sandbox
     │                              (可选)
     ├─── has ───→ SandboxMiddleware ──获取──→ SandboxProvider
     │
     └─── wrapping ──→ AgentAdapter
```

**不依赖沙箱的场景：** 只使用自定义 ToolHandler（如调用外部 API、数据库查询），不需要文件/命令操作。

**依赖沙箱的场景：** Agent 需要读写文件、执行命令、操作项目目录。

**SandboxMiddleware 的桥接作用：** 将 SandboxProvider 与 AgentHarness 的中间件生命周期绑定，实现在合适的时机自动获取和复用沙箱。

---

## 十、配置驱动

沙箱系统通过配置驱动，决定首选后端和降级策略：

```yaml
# config.yaml
sandbox:
  # 首选后端
  provider:
    type: "aio"                      # aio（Docker，默认）| local
    config:
      image: "docker/sandbox-templates:shell"
      memoryLimit: "512m"
      cpuLimit: 1
      networkAccess: false
      idleTimeout: 600000
      workingDir: "/home/agent/workspace"
      envVars:
        NODE_ENV: "production"

  # 降级策略（仅当 provider.type = "aio" 时生效）
  fallback:
    mode: "warn"                     # strict | warn | force
    local:
      allowedDir: "/workspace"
      timeout: 600000
```

### 环境推荐配置

```yaml
# 生产环境 — 严格模式，Docker 不可用就直接报错
sandbox:
  provider:
    type: "aio"
    config:
      image: "docker/sandbox-templates:shell"
      memoryLimit: "512m"
  fallback:
    mode: "strict"
```

```yaml
# 开发环境 — Docker 可用就用，没有就降级到本地
sandbox:
  provider:
    type: "aio"
  fallback:
    mode: "warn"
    local:
      allowedDir: "./workspace"
```

```yaml
# 调试模式 — 强制使用本地沙箱，跳过 Docker
sandbox:
  provider:
    type: "aio"
  fallback:
    mode: "force"
    local:
      allowedDir: "./workspace"
```

这使得不同环境（开发/测试/生产）可以通过配置控制沙箱后端和降级策略而无需修改代码。

---

## 十一、安全边界总结

### 各沙箱后端安全能力

| 安全维度 | LocalSandbox | AioSandbox (Docker) |
|----------|-------------|--------------------|
| 路径遍历 | ✅ `resolvePath()` 越界检测 | ✅ 容器文件系统隔离 |
| 命令超时 | ✅ 600s | ✅ 600s |
| 工作目录锁定 | ✅ `cwd: allowedDir` | ✅ 容器工作目录 |
| 命令注入 | ⚠️ 部分（依赖参数分离） | ⚠️ 部分 |
| 资源限制（CPU/内存/磁盘/进程/FD/I/O） | ❌ | ✅ 12 维 cgroup v2 限制 |
| 网络隔离 | ❌ 无网络策略 | ✅ 可配置 NetworkPolicy |
| 文件系统隔离 | ❌ 可访问 allowedDir 下所有文件 | ✅ 容器文件系统 |
| 进程隔离 | ❌ 宿主机进程 | ✅ 容器命名空间 |
| 空闲超时自动回收 | ❌ | ✅ 600s 后台检查 |

### 降级模式的安全效应

| 模式 | 实际后端 | 安全级别 | 安全假象风险 |
|------|---------|---------|-------------|
| `strict` | 始终 AioSandbox | 容器级 ✅ | 无 |
| `warn`（降级发生时） | LocalSandbox | 进程级 ⚠️ | 低 — 日志有警告、Agent 感知到降级 |
| `force` | 始终 LocalSandbox | 进程级 ⚠️ | 无 — 开发者明确选择 |

### 使用建议

- **生产部署**：`fallback.mode: strict` — Docker 不可用则拒绝服务，绝不静默降级
- **本地开发**：`fallback.mode: warn` — 有 Docker 用 Docker，没有就降级，互不耽误
- **调试 & CI**：`fallback.mode: force` — 完全跳过 Docker，减少启动开销
- **Agent 应感知沙箱类型**：通过 system prompt 注入的沙箱类型元数据，Agent 可以主动避免高风险操作（如执行未知来源脚本）
- **敏感操作**：通过自定义 ToolHandler（而非内置工具）执行需要额外权限的操作，明确审计边界

---

## 十二、架构决策记录

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| **沙箱接口设计** | 细粒度 vs 通用 exec | 混合（exec + readFile/writeFile/listDir/updateFile） | 文件操作有安全敏感度，独立方法便于定制校验 |
| **Provider 设计** | 直接 new vs 工厂接口 | Provider 接口 + 全局单例 | 运行时切换后端，支持 Mock 测试 |
| **沙箱获取时机** | 立即 vs 惰性 | SandboxMiddleware 惰性获取（lazy_init） | 避免非工具场景的不必要开销 |
| **沙箱 ID 生成** | UUID vs 确定性哈希 | SHA256(thread_id) | 可重复、可追溯，便于调试 |
| **空闲管理** | 无 vs 超时回收 | 后台线程扫描 + 600s 空闲超时 | 防止容器泄漏，控制资源消耗 |
| **虚拟路径映射** | 单向 vs 双向 | 双向映射（容器 ↔ 本地） | 工具输出路径对模型更友好 |
| **配置方式** | 硬编码 vs 配置文件 | 反射 + config.yaml 驱动 | 不同环境切换后端无需改代码 |
| **子代理沙箱** | 独立 vs 共享 | 共享父线程沙箱 ID | 减少容器创建开销，保持状态一致 |
| **降级策略** | 无降级 vs 自动降级 | FallbackSandboxProvider（自动降级 + 三种模式） | 保障服务可用性同时让安全策略可配置 |
| **降级模式** | 严格 / 容错 / 跳过 | 三级可配（strict / warn / force） | 不同环境（生产/开发/调试）有不同需求 |
| **沙箱感知** | 透明 vs 可见 | 沙箱类型注入 AgentContext | Agent 需要知道自己在什么隔离级别下运行 |
| **来源追踪** | 静态绑定 vs 动态追踪 | Map<id, origin> 追踪 create/destroy | destroy 时需要根据沙箱来源执行不同清理逻辑 |
| **容器镜像** | 自建 vs Docker sandbox-templates vs DevContainers vs 社区镜像 | `docker/sandbox-templates:shell` | Docker 官方维护的通用 Agent 沙箱镜像，预装多语言运行时和非 root 用户，与 Docker Sandbox 生态兼容。详见 [sandbox-image-selection.md](./sandbox-image-selection.md) |
| **容器命名** | 随机 UUID vs 确定性哈希 | `agenthub-sandbox-` + SHA256(thread_id)[:16] | 可重复 + 可 grep，崩溃后能发现同名容器并复用 |
| **崩溃恢复** | 不处理 vs 启动时清理 | 标签标记（`agenthub-managed=true`）+ 30 分钟冷孤儿清理 | 避免僵尸容器堆积；30min 窗口给热重启机会 |
| **空闲超时实现** | 周期性扫描 vs per-container timer | per-container `setTimeout` + Mutex 临界保护 | 无空转开销；Mutex 防并发释放 |
| **资源限制维度** | 单维 vs 多维 | 12 维（CPU/memory/disk/pid/FD/I/O 等） | 任一维度超限都可能影响宿主机稳定性，全面限制是生产环境的基线要求 |
| **限幅策略粒度** | 固定 vs 场景化配置 | 模板化场景配置（编译/轻量/全功能/安全/不可信） | 不同 agent 任务对资源需求差异显著，固定值要么浪费要么不够 |
| **abort 信号** | 非强制 vs 双层超时 | SIGTERM → 5s 等待 → SIGKILL（通过 docker exec session） | 优雅终止尽可能保存现场，强制终止确保不挂起 |
| **容器停止超时** | 固定 vs 三档可配 | 5s（默认）/ 30s（宽容）/ 0s（强制） | 日常回收快速释放资源，写操作中宽容关闭保障数据完整性 |
