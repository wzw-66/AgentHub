# Sandbox 容器镜像选型调研

## Status

- **Status:** Draft (research completed 2026-07-12)
- **Branch:** dev
- **Related docs:** [`sandbox.md`](./sandbox.md)

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [沙箱场景分析](#2-沙箱场景分析)
3. [候选镜像调研](#3-候选镜像调研)
4. [方案对比](#4-方案对比)
5. [行业参考](#5-行业参考)
6. [方案详解](#6-方案详解)
7. [架构集成分析](#7-架构集成分析)
8. [结论与下一步](#8-结论与下一步)

---

## 1. 背景与目标

AgentHub 沙箱（Sandbox）是 Agent 的安全执行环境，为 Agent 的工具操作（命令执行、文件读写、目录遍历）提供隔离执行上下文。架构设计见 [`sandbox.md`](./sandbox.md)。

当前状态：`LocalSandbox`（宿主机执行）已实现，`AioSandbox`（Docker 容器执行）已规划待实现。

**本调研目标：** 为 AioSandbox 确定容器镜像选型，覆盖以下决策维度：

- 基础操作系统/发行版
- 预装语言运行时与工具链
- 镜像大小与启动速度
- 安全与维护策略
- 与现有架构的集成方式

---

## 2. 沙箱场景分析

### 2.1 Agent 在沙箱中的典型操作

| 操作类型 | 具体行为 | 需要的能力 |
|---------|---------|-----------|
| 代码操作 | 读取/修改/创建源文件 | 文件系统读写 |
| 包管理 | `npm install`, `pnpm add`, `pip install` | 包管理器 + 网络 |
| 构建 | `turbo build`, `tsup`, `next build` | Node.js 运行时 |
| 测试 | `vitest`, `jest`, `pytest` | 语言运行时 |
| 代码质量 | `eslint`, `prettier`, `tsc --noEmit` | Node.js + 工具 |
| 版本控制 | `git clone`, `commit`, `push`, `branch` | Git + 认证 |
| 数据库 | `prisma generate`, `prisma migrate` | OpenSSL, Node.js |
| 脚本执行 | 运行 bash/python 脚本 | Shell + Python |
| 编译原生模块 | `node-gyp rebuild` | build-essential, Python |

### 2.2 技术栈要求

AgentHub 自身和沙箱所需支持的最小技术范围：

| 技术 | 必须程度 | 说明 |
|------|---------|------|
| Node.js 22.x | ✅ 必须 | 主运行时 |
| pnpm 9.15.4 | ✅ 必须 | 项目包管理器 |
| Git | ✅ 必须 | 版本控制 |
| OpenSSL | ✅ 必须 | Prisma HTTPS 连接 |
| Python 3 | ✅ 推荐 | Agent 脚本、node-gyp |
| build-essential | ✅ 推荐 | 原生模块编译 |
| ripgrep / jq | ✅ 推荐 | Agent 代码搜索 |
| Python pip | ⚠️ 可选 | 通用脚本 |
| gh CLI | ⚠️ 可选 | GitHub 操作 |
| Go / Java / Rust | ❌ 不预装 | 按需安装策略 |

### 2.3 安全需求

镜像需满足 AioSandbox 的容器级隔离安全模型：

| 安全需求 | 说明 |
|---------|------|
| 非 root 用户运行 | 默认使用非特权用户（UID 1001） |
| 最小攻击面 | 不安装不必要的包 |
| 定时安全更新 | CI 自动 rebuild 继承基础镜像的安全修复 |
| 可审计 | Dockerfile 在版本控制中，构建日志可追溯 |

---

## 3. 候选镜像调研

### 3.1 Docker 官方 sandbox-templates

| 项目 | 信息 |
|------|------|
| **镜像** | `docker/sandbox-templates:shell` |
| **大小** | ~385 MB |
| **基座** | Ubuntu |
| **维护方** | Docker Inc. |
| **GitHub** | 私有仓库（Docker Desktop 闭源组件） |
| **活跃度** | 官方持续维护，随 Docker Desktop 更新 |

**预装内容：**

```
Node.js (LTS)
Python 3
Go
Java (OpenJDK JRE)
Git + GitHub CLI (gh)
ripgrep + jq
curl / wget / ca-certificates
非 root agent 用户 (UID 1000)
工作目录 /home/agent/workspace
Docker CLI (部分镜像变体)
```

**对应 AioSandbox 的集成方式：**

| 架构组件 | 集成方式 |
|---------|---------|
| `DockerSandboxConfig.image` | `"docker/sandbox-templates:shell"` |
| 用户 | 已是 `agent` 用户，可直接使用 |
| 工作目录 | `/home/agent/workspace`，与架构中的 `workingDir` 字段对应 |

**优点：**

- Docker 官方出品，生态成熟
- 包含 Agent 常用的多语言运行时
- 安全策略与 Docker Sandboxes 产品一致
- 非 root 用户开箱即用

**缺点：**

- 包含 Java、Go 等 AgentHub 可能用不到的工具，增加 CVE 面
- 版本节奏跟随 Docker Desktop 发布周期
- 镜像内容不透明（Dockerfile 未公开）
- 设计目标为 `docker sandbox` CLI，与我们的 `docker exec` API 使用方式存在差异
- 无法精确锁定内部工具版本（Node.js minor version、pnpm 版本等）

**CVE 风险评估：** 中 — Java JRE 和 Go runtime 增加了约 50-80 个额外的高/中危 CVE 暴露面，但 Docker 会持续修复。

---

### 3.2 微软 DevContainers 官方镜像

| 项目 | 信息 |
|------|------|
| **镜像** | `mcr.microsoft.com/devcontainers/typescript-node:22` |
| **大小** | ~700 MB |
| **基座** | Debian 12 (bookworm) + Node.js 22 |
| **维护方** | Microsoft |
| **GitHub** | [devcontainers/images](https://github.com/devcontainers/images) |
| **活跃度** | 极度活跃，数千个项目依赖，周更新 |

**预装内容：**

```
Node.js 22.x (二进制安装，非 apt)
npm / nvm / yarn (via corepack)
TypeScript（tsserver）
Git + GitHub CLI (gh)
Python 3 + pip
build-essential / make / gcc
curl / wget / ca-certificates / openssl
非 root vscode 用户 (UID 1000)
工作目录 /workspaces
```

**DevContainer Features 扩展机制：**

通过 `devcontainer-features` 可按需追加运行时：

| Feature | 类型 | 大小增量 |
|---------|------|---------|
| `ghcr.io/devcontainers/features/python` | Python 扩展 | ~150MB |
| `ghcr.io/devcontainers/features/go` | Go 语言 | ~200MB |
| `ghcr.io/devcontainers/features/rust` | Rust 语言 | ~300MB |
| `ghcr.io/devcontainers/features/docker-in-docker` | Docker | ~100MB |
| `ghcr.io/devcontainers/features/java` | Java SDK | ~250MB |

**优点：**

- 极度成熟，数千个开源项目验证
- Debian base，glibc 兼容性最佳
- DevContainer Features 体系丰富，可按需扩展
- Node.js 版本由微软精确锁定和管理
- GitHub 开源，Dockerfile 完全透明
- 周更新频率，安全修复及时

**缺点：**

- 镜像较大（~700MB）
- 设计目标为 VSCode 远程开发容器，非 AI Agent 执行场景
- vscode 用户存在 sudo 能力（需要额外配置关闭）
- 包含一些 Agent 不需要的 VSCode 相关组件（如 tsserver LSP）

**CVE 风险评估：** 低 — 微软有专门的 CVE 追踪和快速修复流程，Debian 12 base CVE 数量可控。

---

### 3.3 社区 AI Agent 专用镜像

#### 3.3.1 opencode-sandbox

| 项目 | 信息 |
|------|------|
| **镜像** | `ghcr.io/fabianlema/opencode-sandbox:latest` |
| **大小** | ~400 MB |
| **基座** | Debian |
| **维护方** | 社区（fabianlema） |
| **GitHub** | [fabianlema/opencode-sandbox](https://github.com/fabianlema/opencode-sandbox) |
| **活跃度** | 2026 年 2 月起已不活跃 |

**预装内容：**

```
Node.js
Python 3
Git + gh CLI
jq
多架构 (AMD64 + ARM64)
非 root node 用户
```

**评价：** 功能简单但适合，维护已停——作者在 README 中说明 Docker Desktop 已原生支持 OpenCode 沙箱，不再需要此镜像。

#### 3.3.2 nano-step/ai-opencode

| 项目 | 信息 |
|------|------|
| **镜像** | `ghcr.io/nano-step/ai-opencode:base` |
| **大小** | ~2.3 GB |
| **基座** | Debian |
| **维护方** | 社区（nano-step） |
| **npm** | `@nano-step/ai-sandbox-wrapper` |
| **活跃度** | 活跃（v5.4.4, 2026-02 更新） |

**预装内容 (`:base` ~2.3GB)：**

```
Node 22 / Bun / pnpm
Python 3 + uv (快速包管理器)
ripgrep / fd / tmux / vim
Git / gh CLI
Go 1.23
非 root 用户 / CAP_DROP=ALL
MCP 浏览器工具链
```

**全功能版 (`:full` ~2.7GB)：**

`:base` 全部内容 + Playwright 浏览器 + Open Design 助手。

**评价：** 功能最全，但 2.3GB 对于沙箱镜像来说过大，pull 和启动延迟较高。包含大量 AgentHub 可能不需要的组件（Playwright 浏览器、MCP 工具链、Bun runtime）。

#### 3.3.3 agentbox

| 项目 | 信息 |
|------|------|
| **镜像** | Docker Hub `shrwnsan/agentbox` |
| **大小** | 未公开（估计 ~800MB-1GB） |
| **基座** | 多阶段构建 |
| **维护方** | 社区（shrwnsan） |
| **GitHub** | [shrwnsan/agentbox](https://github.com/shrwnsan/agentbox) |
| **活跃度** | 活跃 |

**预装内容：**

```
Python / Node.js / Java / Shell (Zsh + Bash)
Claude CLI / OpenCode CLI
支持 Docker 或 Podman (rootless)
可挂载 Docker socket（选配）
Ephemeral 容器 (--rm) + 持久化 cache 卷
```

**评价：** 设计目标为 "YOLO mode agent container"——允许挂载 Docker socket 运行子容器，适合高级使用场景但安全边界复杂。为多个 CLI 工具做了定制，与我们自建 Harness 的场景不完全匹配。

---

### 3.4 自建镜像

| 项目 | 信息 |
|------|------|
| **镜像** | 自定义 Dockerfile，在 AgentHub 仓库中维护 |
| **大小** | ~450 MB（估计） |
| **基座** | `ubuntu:24.04` |
| **维护方** | AgentHub 团队 |
| **Dockerfile** | 仓库内版本控制 |
| **构建** | GitHub Actions 自动构建 + 按周重建 |

**推荐预装内容（对接 Docker sandbox-template 思路，但按需精简）：**

```
Language runtimes:
  Node.js 22.x (nodesource 官方源)
  Python 3.12 (Ubuntu 原生)
  pnpm 9.15.4（npm install -g）

Code tooling:
  Git
  gh CLI (GitHub CLI)

Build & native module:
  build-essential (gcc, g++, make)
  OpenSSL / libssl-dev

Agent dev utilities:
  ripgrep
  jq
  fd-find
  curl / wget / unzip / xz-utils

Security:
  非 root agent 用户 (UID 1001)
  工作目录 /workspace
```

**不预装（按需安装策略）：**

| 运行时 | 体积 | 不预装理由 |
|--------|------|-----------|
| Go | ~200MB | AgentHub 及大部分前端项目不需要 |
| Java JRE | ~150MB | 与前端/Node 生态无关 |
| Rust | ~300MB | 按需安装 |
| Ruby | ~100MB | 与前端生态无关 |
| PHP | ~100MB | 与前端生态无关 |

**优点：**

- 内容完全掌控，只装需要的
- 版本精确锁定
- 供应链透明（Dockerfile 在仓库中审计）
- 可定制 agent 用户行为、shell 配置、网络策略
- CI 自动 rebuild 获取基础镜像的安全修复

**缺点：**

- 需要维护 Dockerfile
- 新镜像的安全基线需自行负责（可通过 Trivy 扫描自动化）
- 没有大厂背书

---

## 4. 方案对比

### 4.1 综合对比矩阵

| 维度 | Docker sandbox-templates | DevContainers (MS) | opencode-sandbox | nano-step ai-opencode | 自建镜像 |
|------|-------------------------|-------------------|-----------------|----------------------|---------|
| **镜像大小** | ~385 MB | ~700 MB | ~400 MB | ~2.3 GB | ~450 MB |
| **拉取时间 (1Gbps)** | ~3s | ~5.5s | ~3s | ~18s | ~3.5s |
| **容器启动到可用** | 即时 | 即时 | 即时 | 即时 | 即时 |
| **Node.js** | ✅ 有 (版本不透明) | ✅ 22.x 精确 | ✅ 有 | ✅ Node 22 + Bun | ✅ 22.x 精确 |
| **pnpm** | ❌ 需安装 | ⚠️ npm -g 安装 | ❌ 需安装 | ✅ 预装 | ✅ 预装 9.15.4 |
| **Python** | ✅ 有 | ✅ 3.x | ✅ 有 | ✅ + uv | ✅ 3.12 |
| **Git/gh** | ✅ 有 | ✅ 有 | ✅ 有 | ✅ 有 | ✅ 有 |
| **Go/Java** | ✅ 有（可能不需要） | ❌ 可通过 feature 加 | ❌ 无 | ✅ Go 1.23 | ❌ 不预装 |
| **build-essential** | ⚠️ 不确定 | ✅ 有 | ❌ 不确定 | ✅ 有 | ✅ 有 |
| **非 root 用户** | ✅ agent (UID 1000) | ✅ vscode (UID 1000) | ✅ node | ✅ 是 | ✅ agent (UID 1001) |
| **Dockerfile 透明** | ❌ 未公开 | ✅ GitHub 开源 | ✅ GitHub 开源 | ✅ 可查 | ✅ 仓库内 |
| **CVE 面控制** | ⚠️ 包含未知内容 | ⚠️ 包含 VSCode 组件 | ⚠️ 已停更 | ❌ 太大，面广 | ✅ 完全控制 |
| **维护活跃度** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ (不活跃) | ⭐⭐⭐⭐ | ⭐⭐⭐ (自己维护) |
| **安全更新机制** | Docker 跟进 | MS 跟进 | 无保障 | 社区跟进 | CI 自动 rebuild |
| **版本锁定能力** | ⭐ (跟 Docker 节奏) | ⭐⭐⭐⭐ (Feature 级锁定) | ⭐ (无锁定) | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| **扩展性** | ⭐⭐ (额外 FROM 叠加) | ⭐⭐⭐⭐⭐ (Feature 体系) | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ (改 Dockerfile) |
| **多架构支持** | ✅ AMD64 + ARM64 | ✅ AMD64 + ARM64 | ✅ AMD64 + ARM64 | ✅ AMD64 + ARM64 | ✅ (CI 构建) |

### 4.2 按设计目标匹配度

| 方案 | \| 通用 Agent 沙箱 | AgentHub 精确集成 | 安全可控 |
|------|---------------------|-------------------|---------|
| Docker sandbox-templates | ✅ 高 | ⚠️ 中（用户/路径需适配） | ⚠️ 中 |
| DevContainers (MS) | ✅ 高 | ⚠️ 中（需裁剪 VSCode 组件） | ✅ 中高 |
| opencode-sandbox | ⚠️ 低（已停更） | ❌ 低 | ❌ 低 |
| nano-step ai-opencode | ✅ 高 | ❌ 低（包含太多无关组件） | ⚠️ 低（攻击面大） |
| 自建 | ✅ 定制化 | ✅ 完全匹配架构 | ✅ 完全可控 |

### 4.3 与现有 AioSandbox 架构的接口匹配度

AioSandbox 的 `DockerSandboxConfig` 接口字段与各镜像的匹配情况：

```typescript
interface DockerSandboxConfig {
  image: string;
  memoryLimit: string;
  cpuLimit: number;
  networkAccess: boolean;
  idleTimeout: number;
  workingDir: string;
  envVars: Record<string, string>;
}
```

| 字段 | Docker sandbox-templates | DevContainers | 自建 |
|------|--------------------------|--------------|------|
| `workingDir` | `/home/agent/workspace` | `/workspaces` | `/workspace`（可控） |
| `envVars` | 少量预设 | `DEBIAN_FRONTEND=noninteractive` | 完全自定义 |
| 用户切换 | 无需，已是 agent | 需从 vscode 切换 | 完全按设计 |
| 工具路径 | 需探测（brew/apt/手动安装） | 明确 | 完全明确 |

---

## 5. 行业参考

### 5.1 业界主流 AI Agent 沙箱采用的镜像策略

| 项目 | 镜像策略 | 基座 | 规模 |
|------|---------|------|------|
| **Docker Sandboxes (官方)** | 官方 sandbox-templates 系列 | Ubuntu | ~385MB |
| **Claude Code (Docker 模式)** | 默认 Ubuntu，可自定义 | Ubuntu/任何 | 自定义 |
| **E2B** | 用户自定义 Dockerfile，推送到 E2B 注册表 | 任何（Firecracker 微 VM） | 自定义 |
| **CodeSandbox (Together AI)** | 完整 Linux VM（非 OCI） | 任何 | N/A |
| **Modal** | Python SDK 定义 (`modal.Image`) | Debian slim | 自定义 |
| **GitHub Codespaces** | devcontainer.json 定义 | 微软 DevContainers | ~700MB+ |
| **TaskForge (OpenClaw)** | 多 base 镜像 + 按需 rebuild | Debian/Alpine | 按需 |

### 5.2 趋势观察（2025-2026）

1. **微 VM 化**：Docker Sandboxes 走向 Firecracker 微 VM 隔离，gVisor（Modal, Beam）也在普及
2. **自定义镜像成为标配**：几乎所有平台都支持用户自定义 Dockerfile，而非固定镜像
3. **DevContainers 生态融合**：DevContainers 正在成为跨平台开发环境的事实标准
4. **安全左移**：Trivy/COSIGN SBOM 签名 + 自动化 CVE 扫描成为最佳实践
5. **多语言支持收敛**：Node + Python + Go 成为 Agent 沙箱的"三件套"标配

---

## 6. 方案详解

### 6.1 方案 A：Docker sandbox-templates

**使用方式：**

在 AioSandboxProvider 中直接引用镜像：

```typescript
const config: DockerSandboxConfig = {
  image: "docker/sandbox-templates:shell",
  workingDir: "/home/agent/workspace",
  // 无需切换用户，镜像已是 agent 用户
};
```

**适用场景：**

- 团队信任 Docker 的维护节奏
- 不需要精确锁定内部工具版本
- 能接受 Java、Go 等未用组件的 CVE 面

**补充内容（pnpm）：**

由于镜像未预装 pnpm，需要在容器启动或首次工具调用时安装：

```dockerfile
# 方式 1：在 sandbox-templates 基础上叠加
FROM docker/sandbox-templates:shell

RUN npm install -g pnpm@9.15.4

# 或自定义 ENTRYPOINT
```

或通过 `AioSandboxProvider` 的 `envVars` + 启动脚本注入安装命令。

### 6.2 方案 B：DevContainers typescript-node

**使用方式：**

```typescript
const config: DockerSandboxConfig = {
  image: "mcr.microsoft.com/devcontainers/typescript-node:22",
  workingDir: "/workspaces",
};
```

**Sudo 消除：**

vscode 用户默认有 sudo 权限，需在叠加层中移除：

```dockerfile
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# 移除 vscode 的 sudo 权限
RUN sudo rm /etc/sudoers.d/vscode

# 安装 pnpm
RUN npm install -g pnpm@9.15.4

# 设置工作目录
WORKDIR /workspace
USER vscode
```

**可扩展性（DevContainer Features）：**

当需要额外语言支持时，可通过 features 机制追加。但 features 是为 `devcontainer.json` 启动流程设计的，在 `docker exec` 模式下需要预先构建到镜像中。

### 6.3 方案 C：自建镜像

**Dockerfile：**

```dockerfile
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PNPM_VERSION=9.15.4 \
    NODE_MAJOR=22

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl wget gnupg \
    git gh \
    python3 python3-pip \
    build-essential \
    openssl libssl-dev \
    ripgrep jq fd-find \
    unzip xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Node.js (nodesource)
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# pnpm
RUN npm install -g pnpm@${PNPM_VERSION}

# 非 root agent 用户
RUN useradd -m -u 1001 agent

WORKDIR /workspace
USER agent
```

**构建策略：**

```yaml
# .github/workflows/sandbox-image.yml
name: Build Sandbox Image

on:
  push:
    branches: [main, dev]
    paths: ['.sandbox/Dockerfile']
  schedule:
    - cron: '0 3 * * 1'  # 每周一 3AM rebuild（安全更新）

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-qemu-action@v3
      - uses: docker/setup-buildx-action@v3

      - run: |
          docker buildx build \
            --platform linux/amd64,linux/arm64 \
            -t ghcr.io/agenthub/sandbox:latest \
            -t ghcr.io/agenthub/sandbox:$(date +%Y%m%d) \
            -f .sandbox/Dockerfile \
            --push .
```

**镜像存放位置：**

```
.sandbox/              # 沙箱镜像相关文件
├── Dockerfile         # 镜像构建文件
├── entrypoint.sh      # 可选容器启动脚本
└── trivy-scan.sh      # 安全扫描脚本
```

### 6.4 方案 D（混合）：自建 + Docker sandbox-templates 分层

**思路：** Docker sandbox-templates 作为 base，叠加自定义层弥补不足。

```dockerfile
FROM docker/sandbox-templates:shell

# 添加 pnpm
RUN npm install -g pnpm@9.15.4

# 覆盖工作目录配置
ENV HOME=/workspace
WORKDIR /workspace
```

**评价：** 兼顾 Docker 生态成熟度和自定义需求。但 base 镜像的不透明性仍然存在——如果 Docker 改变了 base 镜像中的节点版本或移除了某个包，叠加层可能失效。

---

## 7. 架构集成分析

### 7.1 与 AioSandboxProvider 的集成

无论选择哪个方案，集成路径都是一致的——修改 `DockerSandboxConfig.image` 和 `workingDir`：

```typescript
// AioSandboxProvider 中根据配置选择镜像
const image = config.image || "ghcr.io/agenthub/sandbox:latest";

const container = await docker.createContainer({
  Image: image,
  WorkingDir: config.workingDir || "/workspace",
  User: "agent",  // 非 root
  Env: [
    "HOME=/workspace",
    ...Object.entries(config.envVars).map(([k, v]) => `${k}=${v}`),
  ],
  HostConfig: {
    Memory: parseMemory(config.memoryLimit),
    NanoCpus: config.cpuLimit * 1e9,
    Binds: [`${workspacePath}:/workspace`],
  },
});
```

### 7.2 与 FallbackSandboxProvider 的降级关联

| 降级模式 | 镜像方案影响 |
|---------|------------|
| `strict` | 镜像不可用（pull 失败）→ 直接报错，不受影响 |
| `warn` | 镜像不可用 → 降级到 LocalSandbox，受影响（镜像需可 pull） |
| `force` | 不使用 Docker 沙箱，镜像方案无关 |

### 7.3 多沙箱之间的镜像共享

Docker 镜像在宿主机层共享，相同镜像的多个容器共享已 pull 的镜像层：

```
同一宿主机的 10 个 AioSandbox 容器
  └── 镜像层只 pull 一次（~450MB 磁盘）
  └── 每个容器只增加 ~10MB 的容器层开销
  └── 容器创建时间 ≈ Docker API 调用时间（<100ms）
```

因此镜像大小主要影响首次 pull 时间，持续运行的宿主机上影响很小。

---

## 8. 结论与下一步

### 8.1 选型建议对比

| 推荐序 | 方案 | 适合场景 | 不适用场景 |
|--------|------|---------|-----------|
| ⭐⭐⭐⭐⭐ | **方案 C：自建镜像** | 需要精确控制内容、版本、安全策略的团队；AgentHub 自建 Harness 场景 | 无 Dockerfile 维护能力的小团队 |
| ⭐⭐⭐⭐ | **方案 B：DevContainers** | 已有 DevContainers 基础设施；需要全语言扩展能力 | 不想接受 ~700MB 镜像大小；不需要 VSCode 相关组件 |
| ⭐⭐⭐ | **方案 A：Docker sandbox-templates** | 完全信任 Docker 生态；接受内部版本不透明 | 需要对 CVE 面精确控制 |
| ⭐⭐ | **方案 D：自建 + sandbox-templates 分层** | 折中方案，但牺牲透明性 | 对供应链透明性有硬性要求 |

### 8.2 选择前置条件

| 决策 | 需要确认 |
|------|---------|
| 选自建 | Dockerfile 维护能力和 CI 构建流水线就绪 |
| 选 DevContainers | 能接受 ~700MB 镜像和 VSCode 组件残留 |
| 选 Docker sandbox-templates | 接受内容不透明和版本跟随 Docker 节奏 |
| 选社区镜像 | **不推荐** — 维护可靠性不足 |

### 8.3 推荐路径

**短期（MVP/开发阶段）：** 方案 C（自建），Dockerfile 简单可直接维护。~450MB 镜像在开发环境足够。

**长期（生产部署）：** 方案 C 持续迭代，通过 CI 自动 rebuild + Trivy 扫描保障安全。需要扩展语言支持时修改 Dockerfile 即可。

---

## 参考

- [Sandbox 架构设计](./sandbox.md)
- Docker Sandboxes: https://www.docker.com/products/docker-sandboxes/
- Docker Sandbox Templates: https://docs.docker.com/ai/sandboxes/customize/templates/
- DevContainers Images: https://github.com/devcontainers/images
- AgentBox: https://github.com/shrwnsan/agentbox
- E2B Documentation: https://e2b.dev/docs
- Modal Sandbox: https://modal.com/docs/guide/sandbox
