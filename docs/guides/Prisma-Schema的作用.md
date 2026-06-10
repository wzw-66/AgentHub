# Prisma Schema 的作用详解

`schema.prisma` 是 Prisma ORM 的核心配置文件。它是整个项目数据层的“单一事实来源”（Single Source of Truth），负责连接业务代码与底层数据库。

## 核心作用

| 作用                        | 说明                                                                      |
| --------------------------- | ------------------------------------------------------------------------- |
| **数据建模 (Modeling)**     | 使用声明式语法定义数据库表（Model）、字段、索引以及表与表之间的关联关系。 |
| **数据库配置 (Datasource)** | 指定要连接的数据库类型（如 PostgreSQL, MySQL, SQLite）以及连接字符串。    |
| **客户端生成 (Generator)**  | 配置如何生成 Prisma Client，为业务代码提供强类型的数据库操作 API。        |
| **数据库迁移 (Migration)**  | 作为 `prisma migrate` 的基准，自动生成 SQL 脚本来同步数据库结构。         |

## 在本项目中的应用

项目中的 Schema 文件位于 [schema.prisma](file:///d:/code/github/AgentHub/packages/db/prisma/schema.prisma)。

### 1. 数据模型定义

它定义了 AgentHub 的核心业务实体：

- **User**: 用户信息及账号关联。
- **Agent**: AI 智能体配置。
- **Conversation & Message**: 聊天会话与消息历史。
- **Artifact**: 聊天过程中产生的中间产物（如代码片段、网页预览）。

### 2. 关系处理

通过 `@relation` 属性处理复杂的业务逻辑，例如：

- **级联删除 (`onDelete: Cascade`)**: 当一个用户被删除时，其关联的联系人、会话和凭据也会被自动清理。
- **父子消息**: 使用自关联定义消息的层级结构（回复关系）。

### 3. 类型安全保障

主键统一使用 `cuid()` 算法生成，相比传统的自增 ID 更具扩展性且更安全。

## 开发工作流

1. **修改 Schema**: 在 `schema.prisma` 中添加或修改模型。
2. **同步数据库**: 运行 `npx prisma migrate dev`，这会同步数据库并更新本地类型定义。
3. **编写代码**: 在业务逻辑中使用自动生成的 `prisma` 对象进行增删改查，享受完美的 TypeScript 自动补全。

## 总结

`schema.prisma` 不仅仅是一个配置文件，它是整个应用后端逻辑的基石。它让开发者能够以“面向对象”的方式思考数据结构，同时保证了数据库层面的严谨性和代码层面的类型安全。
