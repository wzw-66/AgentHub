# SQLite FTS5 全文搜索引擎详解

> 基于 AgentHub 长期记忆模块的 FTS5 使用场景展开讲解

## FTS 是什么？

FTS = **Full-Text Search**（全文搜索）。标准 SQL 的 `LIKE '%keyword%'` 只能做简单的子串匹配，无法解决：

- **分词问题**："PostgreSQLPrisma" 作为一个整体无法匹配 "PostgreSQL"
- **排序问题**：匹配到的结果无法按相关性排序
- **性能问题**：`LIKE '%xxx%'` 无法使用索引，必须全表扫描

FTS 就是专门解决这些问题的。

---

## FTS5 是什么？

FTS5 是 SQLite **内置的全文搜索引擎**，第 5 个版本。它是 SQLite 标准发行版的一部分，不需要额外安装任何依赖。

**关键事实**：它不是单独的数据库，而是 SQLite 的**虚拟表模块**（virtual table module）。

---

## 虚拟表的概念

普通表存实际数据：

```
memory_records:
┌──────┬──────────┬──────────────────────────┐
│ rowid│ content  │ tags                     │
├──────┼──────────┼──────────────────────────┤
│ 1    │ 用React  │ ["frontend","react"]     │
│ 2    │ 用Prisma │ ["database","prisma"]    │
└──────┴──────────┴──────────────────────────┘
```

FTS5 虚拟表**不存原始数据**，它只存**倒排索引**（inverted index）：

```
memory_fts (虚拟表, 只存索引):
"react"    → 出现在[文档1, ...]
"prisma"   → 出现在[文档2, ...]
"frontend" → 出现在[文档1, ...]
"database" → 出现在[文档2, ...]
```

当你搜索时，FTS5 直接查这个索引表，速度快得多。

---

## 倒排索引 详细图解

**正排索引**（普通数据库，按文档查词）：

```
文档1: "用户喜欢用 React"
文档2: "项目用 Prisma"

搜索"React" → 遍历每篇文档 → 逐字匹配 → 找到文档1
```

**倒排索引**（FTS，按词查文档）：

```
预先建好索引：
"React"  → 文档1
"Prisma" → 文档2
"用户"   → 文档1
"项目"   → 文档2
"喜欢"   → 文档1

搜索"React" → 直接查索引表 → 立即找到文档1  ← O(1) 而不是 O(n)
```

这就是 FTS 快的原因。

---

## FTS5 的分词（Tokenization）

普通文本怎么拆成词？FTS5 用 **tokenizer**（分词器）：

```
输入: "用户喜欢用PostgreSQL+Prisma做数据库"
                 ↓ tokenize
输出: "用户" "喜欢" "用" "PostgreSQL" "Prisma" "做" "数据库"
```

记忆系统用的分词器是 `unicode61`：

```sql
tokenize='unicode61'
```

`unicode61` 的特点：

- 按 Unicode 字符边界分词
- 识别字母、数字、下划线序列
- **支持中文**（按单个汉字分词，虽然不如专业中文分词器精准，但够用）
- 默认忽略大小写（`React` = `react`）

**对比其他分词器**：

| Tokenizer | 特点 |
|-----------|------|
| `unicode61` | 默认，支持中文按字分 |
| `porter` | 支持词干提取（running→run） |
| `trigram` | 按 3-gram 分，支持模糊匹配 |

---

## FTS5 的三种表类型

### 1. 完整表（content table）

所有数据存在 FTS 虚拟表里，**不关联外部表**：

```sql
CREATE VIRTUAL TABLE docs USING fts5(title, body);
INSERT INTO docs VALUES('标题', '正文内容');
-- 数据和索引都在虚拟表里，会冗余存储
```

### 2. 外部内容表（content=）← 记忆系统用的

数据存在普通表里，FTS5 只存索引：

```sql
-- 普通表存真实数据
CREATE TABLE memory_records (
  id TEXT PRIMARY KEY,
  content TEXT,
  tags TEXT
);

-- FTS5 只建索引，数据指向外部表
CREATE VIRTUAL TABLE memory_fts USING fts5(
  content, tags,
  content='memory_records',   -- 关联的外部表
  content_rowid='rowid'        -- 关联的 rowid 列
);
```

**优点**：不冗余存储，数据更新只改一个地方。

**代价**：FTS5 不能自动感知外部表的变化，所以需要手动触发同步：

```sql
-- 插入时：把数据同步到 FTS
CREATE TRIGGER mem_fts_ai AFTER INSERT ON memory_records BEGIN
  INSERT INTO memory_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, new.tags);
END;

-- 删除时：从 FTS 中删除
CREATE TRIGGER mem_fts_ad AFTER DELETE ON memory_records BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, tags)
  VALUES('delete', old.rowid, old.content, old.tags);
END;

-- 更新时：先删旧索引，再插新索引
CREATE TRIGGER mem_fts_au AFTER UPDATE ON memory_records BEGIN
  INSERT INTO memory_fts(memory_fts, rowid, content, tags)
  VALUES('delete', old.rowid, old.content, old.tags);
  INSERT INTO memory_fts(rowid, content, tags)
  VALUES (new.rowid, new.content, new.tags);
END;
```

### 3. 无外部内容表（content=）

适合不需要原始数据的场景，只保留索引用于搜索。

---

## FTS5 的检索语法

### 基础语法

```sql
-- 在 content 列搜索包含 "React" 的文档
SELECT * FROM memory_fts WHERE memory_fts MATCH 'React';

-- 在 content 列搜索包含 React AND Prisma 的
SELECT * FROM memory_fts WHERE memory_fts MATCH 'React Prisma';
-- 默认是 AND 关系

-- 搜索 React OR Vue
SELECT * FROM memory_fts WHERE memory_fts MATCH 'React OR Vue';

-- 精确短语匹配
SELECT * FROM memory_fts WHERE memory_fts MATCH '"React 18"';

-- 排除词
SELECT * FROM memory_fts WHERE memory_fts MATCH 'React -Vue';

-- 指定列搜索
SELECT * FROM memory_fts WHERE memory_fts MATCH 'content:React tags:frontend';
```

### 在记忆系统中的使用

需要把 FTS 结果**关联回原始表**：

```typescript
async function searchMemories({ query, userId, limit }) {
  const rows = db.prepare(`
    SELECT r.*
    FROM memory_records r
    JOIN memory_fts f ON r.rowid = f.rowid
    WHERE f.memory_fts MATCH ?
    AND r.user_id = ?
    ORDER BY rank    -- FTS5 内置的相关性排序
    LIMIT ?
  `).all(query, userId, limit);
  return rows;
}
```

### FTS5 的相关性排序（rank）

FTS5 内置了 **BM25 算法**（和 Elasticsearch 一样）来计算相关性排名：

- 词频（TF）：关键词在文档中出现越多次 → 越相关
- 逆文档频率（IDF）：关键词在整个文档集中越罕见 → 越相关
- 文档长度：越短的文档匹配到关键词 → 越相关

```sql
-- 默认按相关性降序排列
SELECT * FROM memory_fts
WHERE memory_fts MATCH 'React'
ORDER BY rank;  -- rank 越小越相关
```

---

## 和 Elasticsearch 的对比

| 特性 | FTS5 | Elasticsearch |
|------|------|---------------|
| 部署 | 内嵌在 SQLite，零部署 | 独立服务，需要 JVM |
| 性能 | 百万级文档以内足够快 | 十亿级 |
| 资源 | 几乎不占内存 | 吃内存大户 |
| 功能 | 基础全文搜索 | 聚合、分析、复杂查询 |
| 大小 | SQLite 库几百 KB | 几百 MB+ |

**为什么记忆系统选 FTS5？**

记忆数据**按用户 + Agent 隔离**，每个 Agent 的记忆量不会很大（几千到几万条），FTS5 完全够用。不需要额外部署 ES 服务，保持架构轻量。

---

## FTS5 的局限

1. **不支持中文分词器** — `unicode61` 只能按单个汉字分，不能理解中文词组。"人工智能"会被分成"人" "工" "智" "能"，搜索"智能"能匹配，但"人工"也能匹配。专业做法需要 `jieba` 等外部分词器。

2. **不支持模糊匹配** — 搜索"Reacht" 拼写错误了，FTS5 不会自动纠正为"React"

3. **不支持同义词** — 搜"JS" 不会匹配 "JavaScript"

但对于记忆系统的使用场景（搜索精确关键词），这些局限可以接受。

---

## 一句话总结

**FTS5 = SQLite 自带的迷你 Elasticsearch。不需要装任何东西，建一张虚拟表，插入数据时自动建好倒排索引，搜索时直接用 MATCH 语法就能又快又准地搜到相关记忆，还自动按相关性排好序。**
