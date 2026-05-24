## Why

AgentHub 的 monorepo 基础和共享类型包（`@agenthub/shared`）已完成，但数据库层尚未实现。所有上层模块（认证、API 服务器、实时通信、聊天界面）都依赖数据库提供持久化能力。独立创建 `@agenthub/db` 包，可以尽早验证 Prisma schema 和仓储接口，为后续模块提供稳定的数据访问层。

## What Changes

- 创建 `packages/db` 包，基于 Prisma + PostgreSQL 实现数据持久化
- 定义 7 个数据模型的 Prisma schema：User、Agent、Contact、Conversation、Message、Artifact、UserCredential
- 实现 6 个仓储模块的完整 CRUD 函数
- 引入 Docker Compose 管理本地 PostgreSQL 开发数据库
- 编写基于真实数据库的集成测试，使用事务隔离策略
- 编写开发环境 seed 脚本
- 在 `turbo.json` 中注册 `@agenthub/db` 的构建和测试任务

## Capabilities

### New Capabilities

- `database`: Prisma schema 定义、Prisma 客户端单例、6 个仓储的 CRUD 函数、数据库迁移、seed 数据

### Modified Capabilities

*无需修改已有 capability*

## Impact

- 新增 `packages/db/` 目录，约 20+ 个文件
- 新增依赖：`prisma`、`@prisma/client`、`@agenthub/shared`
- 根目录新增 `docker-compose.yaml` 管理 PostgreSQL
- 新增开发数据库连接串 `DATABASE_URL`
- `turbo.json` 新增 db 包的 build/test pipeline
- `pnpm-workspace.yaml` 自动包含 `packages/*`，无需修改
