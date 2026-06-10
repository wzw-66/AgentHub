# 沙箱架构设计

沙箱（Sandbox）是 AgentHub 中**安全执行环境**的抽象层，为 Agent 的工具操作（命令执行、文件读写、目录遍历）提供隔离、受控的执行上下文。

## Status

- **Status:** Complete
- **Date:** 2026-06-07
- **Branch:** dev
- **Package:** `@agenthub/agent-core/src/harness/sandbox/`

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
              │  │         │ │ updateFile()  │ │
              │  └─────────┘ └───────────────┘ │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
     ┌────────▼────────┐          ┌───────────▼────────┐
     │   LocalSandbox   │          │  AioSandboxProvider │
     │   (本地执行)      │          │  (Docker 容器)      │
     │                  │          │                    │
     │  路径安全校验     │          │  完全容器隔离        │
     │  超时控制(600s)  │          │  资源限制(CPU/内存)  │
     │  同步文件操作     │          │  网络策略            │
     │  虚拟路径映射     │          │  镜像管理            │
     └─────────────────┘          └──────────┬─────────┘
                                             │
                                    ┌────────▼────────┐
                                    │RemoteSandboxBackend│
                                    │  (K8s 分布式)     │
                                    │                  │
                                    │  自动扩缩容        │
                                    │  跨节点调度        │
                                    └─────────────────┘
```

### 架构层次

| 层 | 组件 | 职责 |
|----|------|------|
| **接口层** | `Sandbox` interface | 统一的操作抽象 |
| **提供者** | `SandboxProvider` interface | 沙箱实例的工厂与生命周期管理 |
| **管理器** | `SandboxManager` | 全局单例管理、缓存、优雅关闭 |
| **具体实现** | `LocalSandbox` / `AioSandbox` / `RemoteSandboxBackend` | 不同后端的实际执行 |

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
| `acquire` | 获取一个沙箱 | 本地模式直接创建；Docker 模式启动容器；K8s 模式创建 Pod |
| `get` | 按 ID 获取已有沙箱 | 用于子代理复用父线程的沙箱 |
| `release` | 释放单个沙箱 | 本地模式无操作；Docker 模式停止容器；K8s 模式删除 Pod |
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
| LocalSandboxProvider | 返回固定 `"default"` ID | 无操作 |
| AioSandboxProvider | 创建 Docker 容器，返回容器 ID | 停止所有容器 |
| RemoteSandboxBackend | 调用 K8s API 创建 Pod | 删除所有 Pod |

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

`LocalSandbox` 是本地开发环境的主要实现，运行在宿主机上，通过安全约束保障执行安全。

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

AioSandboxProvider 提供基于 Docker/OCI 容器的完全隔离执行环境，适用于生产环境。

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
  image: string;                    // 容器镜像（如 "node:20"）
  memoryLimit: string;              // 内存限制（如 "512m"）
  cpuLimit: number;                 // CPU 限制
  networkAccess: boolean;           // 网络访问策略
  idleTimeout: number;              // 空闲超时（ms，默认 600000）
  workingDir: string;               // 工作目录
  envVars: Record<string, string>;  // 环境变量
}
```

### 与 LocalSandbox 的对比

| 特性 | LocalSandbox | AioSandbox |
|------|-------------|------------|
| 隔离级别 | 进程级 | 容器级 |
| 路径安全 | 白名单检测 | 容器文件系统天然隔离 |
| 资源限制 | 无 | CPU/内存限制 |
| 网络策略 | 宿主机网络 | 可配置（隔离/受限/开放） |
| 启动开销 | 无 | 秒级（容器创建） |
| 适用环境 | 开发 | 生产 |

---

## 五、RemoteSandboxBackend（K8s 分布式沙箱）

RemoteSandboxBackend 通过 Kubernetes API 在集群中管理沙箱 Pod，适用于分布式部署场景。

### 架构

```
RemoteSandboxBackend
    │
    ├── K8s Provisioner API
    │   ├── POST /sandboxes        → 创建 Pod
    │   ├── GET /sandboxes/:id     → 查询状态
    │   ├── DELETE /sandboxes/:id  → 删除 Pod
    │   └── GET /sandboxes         → 列表
    │
    ├── Pod 模板
    │   ├── 指定镜像和资源请求
    │   ├── 挂载 PVC 或临时存储
    │   └── 网络策略（NetworkPolicy）
    │
    └── 生命周期管理
        ├── 自动清理过期 Pod
        ├── 资源配额管理
        └── 跨节点调度
```

### 配置示例

```typescript
interface RemoteSandboxConfig {
  apiEndpoint: string;              // K8s API 端点
  namespace: string;                // K8s 命名空间
  image: string;                    // 容器镜像
  resourceRequests: {               // 资源请求
    cpu: string;
    memory: string;
  };
  resourceLimits: {                 // 资源限制
    cpu: string;
    memory: string;
  };
  idleTimeout: number;              // 空闲超时
  ttlAfterFinished: number;         // 完成后保留时间
}
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

---

## 七、与 ToolRegistry 的集成

Sandbox 与 ToolRegistry 的绑定关系：

```typescript
// 创建沙箱 → 绑定到 ToolRegistry → 自动注册内置工具
const sandbox = new LocalSandbox(workspacePath);
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

沙箱提供者通过配置文件中的字符串路径动态解析，支持运行时切换：

```yaml
# config.yaml (通过反射动态加载)
sandbox:
  use: "src.sandbox.local_sandbox_provider.LocalSandboxProvider"
  # use: "src.sandbox.aio_sandbox_provider.AioSandboxProvider"
  # use: "src.sandbox.remote_sandbox_backend.RemoteSandboxBackend"
```

```typescript
// 通过反射解析配置中的类名
const provider = resolveClass<SandboxProvider>(config.sandbox.use);
```

这使得不同环境（开发/测试/生产）可以通过配置切换沙箱后端而无需修改代码。

---

## 十一、安全边界总结

### 各沙箱后端安全能力

| 安全维度 | LocalSandbox | AioSandbox (Docker) | RemoteSandbox (K8s) |
|----------|-------------|--------------------|--------------------|
| 路径遍历 | ✅ `resolvePath()` 越界检测 | ✅ 容器文件系统隔离 | ✅ 容器文件系统隔离 |
| 命令超时 | ✅ 600s | ✅ 600s | ✅ 可配置 |
| 工作目录锁定 | ✅ `cwd: allowedDir` | ✅ 容器工作目录 | ✅ Pod 工作目录 |
| 命令注入 | ⚠️ 部分（依赖参数分离） | ⚠️ 部分 | ⚠️ 部分 |
| 资源限制（CPU/内存） | ❌ | ✅ | ✅ |
| 网络隔离 | ❌ 无网络策略 | ✅ 可配置 NetworkPolicy | ✅ K8s NetworkPolicy |
| 文件系统隔离 | ❌ 可访问 allowedDir 下所有文件 | ✅ 容器文件系统 | ✅ 容器文件系统 |
| 进程隔离 | ❌ 宿主机进程 | ✅ 容器命名空间 | ✅ Pod 隔离 |
| 空闲超时自动回收 | ❌ | ✅ 600s 后台检查 | ✅ TTL 机制 |

### 使用建议

- **本地开发**：`LocalSandbox` 提供基本安全，启动快，适合调试
- **生产环境**：`AioSandboxProvider` 提供容器级隔离，推荐生产部署
- **分布式部署**：`RemoteSandboxBackend` 适合多节点集群环境
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
