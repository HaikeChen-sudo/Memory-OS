# Memory OS — 数据库设计

> 本文记录 V1 MySQL 结构。V2 改用“事件事实源 + 派生投影”，模型定义见 `MemoryOS-V2-Research-Architecture.md`。
> 数据库：MySQL (via mysql2 + Drizzle ORM)
> 设计原则：核心字段尽量 NOT NULL + DEFAULT，扩展全进 jsonb/JSON，未来字段提前占位列但不建索引。
> 最后更新：2026-08-10

---

## 1. 实体关系总览

```
                    ┌──────────────┐
                    │   Folder     │
                    │  (文件夹)     │
                    └──────┬───────┘
                           │ 1
                           │ N
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌──────────────┐ ┌──────────┐ ┌──────────┐
     │   Memory     │ │ Session  │ │  File    │
     │  (记忆卡片)   │ │ (对话)   │ │ (文件记录)│
     └──────┬───────┘ └────┬─────┘ └────┬─────┘
            │ N            │ 1          │ 1
            │              │ N          │ 1
     ┌──────▼───────┐ ┌────▼─────┐ ┌────▼──────────┐
     │  Connection  │ │ Message  │ │  FileContent  │
     │  (关系连线)   │ │ (消息)   │ │  (文件内容)   │
     └──────────────┘ └──────────┘ └───────────────┘
```

### 关系说明

| 关系 | 基数 | 说明 |
|---|---|---|
| Folder → Memory | 1:N | 一个文件夹包含多条记忆 |
| Folder → Session | 1:N | 一个文件夹包含多个对话 |
| Folder → File | 1:N | 一个文件夹包含多个文件记录 |
| Session → Message | 1:N | 一个对话包含多条消息 |
| Message → Memory | N:N | AI 回复中引用的记忆，存 citations JSON + 通过 Connection 表 |
| Memory → File | 1:1 | 每条文件类记忆关联一个文件记录 |
| File → FileContent | 1:1 | 每个文件记录关联解析后的文本内容 |
| Memory ↔ Memory | N:N | 通过 Connection 表建立语义/时间/手动关联 |
| Connection | N:N | 当前使用 source_id/target_id（memory→memory），未来扩展多态 |

> **实际与设计文档差异**：`Connection` 表当前使用 `source_id`/`target_id`（非多态）。未来需改为 `from_type/from_id/to_type/to_id` 以支持 memory↔message↔source 多态关联。

---

## 2. 表设计（实际 Drizzle Schema）

### 2.1 folders

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `varchar(36)` | PK | UUID |
| `user_id` | `varchar(36)` | NOT NULL, DEFAULT 'default' | 预留多用户 |
| `name` | `varchar(255)` | NOT NULL | 文件夹名 |
| `color` | `varchar(20)` | NOT NULL, DEFAULT '#3b82f6' | 标记色 |
| `created_at` | `datetime` | NOT NULL | |
| `updated_at` | `datetime` | NOT NULL | |

**注意**：文件夹是应用层的隔离单位。所有 memories、sessions、files 通过 `folder_id` 关联文件夹。`user_id` 字段预留多用户支持，当前所有记录用 `"default"`。

---

### 2.2 memories

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `varchar(36)` | PK | UUID |
| `user_id` | `varchar(36)` | NOT NULL, DEFAULT 'default' | 预留多用户 |
| `folder_id` | `varchar(36)` | NOT NULL | FK → folders.id |
| `type` | `varchar(50)` | NOT NULL | image / pdf / text / video_link / audio_link / web_link / note |
| `title` | `varchar(500)` | NOT NULL | 记忆标题 |
| `content` | `longtext` | NOT NULL | 正文/URL/OCR 提取文本 |
| `created_at` | `datetime` | NOT NULL | 时间线排序核心字段 |
| `updated_at` | `datetime` | NOT NULL | |
| `source_id` | `varchar(36)` | NULLABLE | 原始素材引用 |
| `source_url` | `longtext` | NULLABLE | 原始 URL |
| `summary` | `longtext` | NULLABLE | AI 生成摘要 |
| `preview` | `longtext` | NULLABLE | 缩略图 data URL |
| `time_layer` | `varchar(50)` | NOT NULL, DEFAULT 'today' | today/yesterday/this_week/this_month/this_year/older |
| `embedding` | `json` | NULLABLE | 向量（未来） |
| `position` | `json` | NULLABLE | `{x, y, z}` 画布坐标（未来） |
| `color` | `varchar(20)` | NOT NULL, DEFAULT '#3b82f6' | 卡片颜色 |
| `animation_state` | `varchar(50)` | NOT NULL, DEFAULT 'idle' | 动画状态 |
| `metadata` | `json` | NOT NULL | 扩展字段（见下方） |
| `keywords` | `json` | NULLABLE | AI 生成关键词数组 |

**metadata json 扩展字段**：

```jsonc
{
  "file_id": "uuid",            // 关联的 FileRecord ID
  "topics": ["机器学习", "产品设计"],
  "entities": ["张三", "OpenAI"],
  "ai": {
    "sentiment": "positive",
    "importance_score": 0.85
  },
  "custom": {}
}
```

---

### 2.3 sessions

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `varchar(36)` | PK | UUID |
| `user_id` | `varchar(36)` | NOT NULL, DEFAULT 'default' | 预留多用户 |
| `folder_id` | `varchar(36)` | NOT NULL | FK → folders.id |
| `title` | `varchar(255)` | NOT NULL, DEFAULT '新对话' | 对话标题 |
| `color` | `varchar(20)` | NOT NULL, DEFAULT '#3b82f6' | 标记色 |
| `animation_state` | `varchar(50)` | NOT NULL, DEFAULT 'idle' | idle/active/archived |
| `created_at` | `datetime` | NOT NULL | |
| `updated_at` | `datetime` | NOT NULL | 最后消息时间 |

---

### 2.4 messages

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `varchar(36)` | PK | UUID |
| `user_id` | `varchar(36)` | NOT NULL, DEFAULT 'default' | 预留多用户 |
| `session_id` | `varchar(36)` | NOT NULL | FK → sessions.id |
| `role` | `varchar(20)` | NOT NULL | user / assistant / system |
| `content` | `longtext` | NOT NULL | 消息文本，AI 消息可含 `[ref:memory_id]` |
| `citations` | `json` | NOT NULL | `[{memory_id, source_id, text_snippet, strength, position_in_message}]` |
| `animation_state` | `varchar(50)` | NOT NULL, DEFAULT 'idle' | entering/idle/streaming |
| `created_at` | `datetime` | NOT NULL | |

**citations 结构**：

```jsonc
[
  {
    "memory_id": "uuid",
    "source_id": null,
    "text_snippet": "被引用的原文片段...",
    "strength": 0.92,
    "position_in_message": null
  }
]
```

---

### 2.5 connections

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `varchar(36)` | PK | UUID |
| `user_id` | `varchar(36)` | NOT NULL, DEFAULT 'default' | 预留多用户 |
| `source_id` | `varchar(36)` | NOT NULL | 来源节点 ID（当前即 from memory.id） |
| `target_id` | `varchar(36)` | NOT NULL | 目标节点 ID（当前即 to memory.id） |
| `connection_type` | `varchar(50)` | NOT NULL | citation / semantic_similarity / temporal_proximity / topic_cluster / manual / derived_from |
| `weight` | `float` | NOT NULL, DEFAULT 0.5 | 关系强度 0-1 |
| `label` | `varchar(255)` | NULLABLE | 关系标签 |
| `color` | `varchar(20)` | NOT NULL, DEFAULT '#3b82f6' | 连线颜色 |
| `animation_state` | `varchar(50)` | NOT NULL, DEFAULT 'idle' | idle/drawing/highlighted |
| `spatial_path` | `json` | NULLABLE | SVG path 坐标（未来画布渲染） |
| `metadata` | `json` | NOT NULL | 扩展字段 |
| `created_at` | `datetime` | NOT NULL | |

**⚠️ 设计债务**：当前 `source_id`/`target_id` 隐式指向 `memories` 表。不支持 message↔memory 或 source↔memory 的直接关联。参考原设计文档的多态方案，未来迁移：

```sql
-- 未来迁移
ALTER TABLE connections ADD COLUMN from_type varchar(20);
ALTER TABLE connections ADD COLUMN to_type varchar(20);
-- 回填: SET from_type='memory', to_type='memory'
-- 删除 source_id/target_id，改用 from_id/to_id
```

---

### 2.6 settings

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `varchar(36)` | PK | UUID |
| `key` | `varchar(255)` | NOT NULL | 设置键名 |
| `value` | `json` | NULLABLE | 设置值（JSON 序列化） |

---

### 2.7 files

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `varchar(36)` | PK | UUID |
| `user_id` | `varchar(36)` | NOT NULL, DEFAULT 'default' | 预留多用户 |
| `memory_id` | `varchar(36)` | NOT NULL | FK → memories.id |
| `folder_id` | `varchar(36)` | NOT NULL | FK → folders.id |
| `type` | `varchar(20)` | NOT NULL | image / pdf / video |
| `original_name` | `varchar(500)` | NOT NULL | 原始文件名/链接 |
| `parse_status` | `varchar(20)` | NOT NULL, DEFAULT 'pending' | pending / parsing / done / error |
| `created_at` | `datetime` | NOT NULL | |

---

### 2.8 file_contents

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `file_id` | `varchar(36)` | PK | FK → files.id |
| `user_id` | `varchar(36)` | NOT NULL, DEFAULT 'default' | 预留多用户 |
| `extracted_text` | `longtext` | NOT NULL | OCR/分析提取的文本 |
| `chunks` | `json` | NOT NULL | 分块后的文本数组 |
| `extracted_at` | `datetime` | NOT NULL | 提取时间 |

---

## 3. 索引设计（当前实际）

由于使用 Drizzle ORM 声明式 schema，当前未显式创建索引。以下是必须创建的索引：

### Memory

| 索引名 | 字段 | 类型 | 用途 |
|---|---|---|---|
| `idx_memory_folder_id` | `folder_id` | B-tree | 按文件夹查询 |
| `idx_memory_type` | `type` | B-tree | 按类型筛选 |
| `idx_memory_created_at` | `created_at` | B-tree DESC | 时间线排序 |
| `idx_memory_time_layer` | `time_layer` | B-tree | 时间分层查询 |

### Session

| 索引名 | 字段 | 类型 | 用途 |
|---|---|---|---|
| `idx_session_folder_id` | `folder_id` | B-tree | 按文件夹查询 |
| `idx_session_updated_at` | `updated_at` | B-tree DESC | 对话列表排序 |

### Message

| 索引名 | 字段 | 类型 | 用途 |
|---|---|---|---|
| `idx_message_session_id` | `session_id` | B-tree | 按对话查消息 |
| `idx_message_session_created` | `(session_id, created_at)` | B-tree | 按对话+时间排序 |

### File

| 索引名 | 字段 | 类型 | 用途 |
|---|---|---|---|
| `idx_file_memory_id` | `memory_id` | B-tree | 按记忆查文件 |
| `idx_file_folder_id` | `folder_id` | B-tree | 按文件夹查文件 |

### Connection

| 索引名 | 字段 | 类型 | 用途 |
|---|---|---|---|
| `idx_connection_source` | `source_id` | B-tree | 查某节点的所有出边 |
| `idx_connection_target` | `target_id` | B-tree | 查某节点的所有入边 |
| `idx_connection_type` | `connection_type` | B-tree | 按关系类型筛选 |

> **向量索引**：当前未启用。未来使用 `embedding` 字段时，根据数据量选择 IVFFlat (< 10万) 或 HNSW (> 10万)。

---

## 4. 扩展字段策略

### JSON 序列化规则（MySQLAdapter 实现）

MySQL JSON 列不能存原生 JS 对象，必须在写入前 `JSON.stringify()`，读取后 `JSON.parse()`。

`MySQLAdapter` 的 `serializeRecord()` / `deserializeRecord()` 自动处理以下字段：

| 表 | JSON 字段 |
|---|---|
| memories | `embedding`, `position`, `metadata`, `keywords` |
| messages | `citations` |
| connections | `spatial_path`, `metadata` |
| settings | `value` |
| file_contents | `chunks` |

### 写入与导入原子性

- 单条保存使用 MySQL `INSERT ... ON DUPLICATE KEY UPDATE`，不会先删除旧行。
- `importAll()` 先校验集合和主键，再在一个事务内清表与插入；任一记录失败时整批回滚。
- `file_contents` 的领域主键是 `file_id`。IndexedDB 内部仍使用 `id` keyPath，导入导出通过主键映射转换。

### 时间格式转换

- **写入**：ISO 8601 (`2026-06-05T12:00:00.000Z`) → MySQL datetime (`2026-06-05 12:00:00`)
- **读取**：MySQL datetime → ISO 8601 格式字符串

### jsonb 使用规范

1. **核心查询条件不进 jsonb**：`type`、`folder_id`、`created_at`、`parse_status` 等高频 WHERE 字段必须独立列
2. **JSON 列按需建索引**：MySQL 支持虚拟列 + 索引（`GENERATED ALWAYS AS (metadata->>'$.importance_score')`）
3. **不要往 json 列放太大值**：单个 JSON 列建议 < 1MB，大文本用 `longtext` 独立列
4. **app 层校验**：TypeScript 类型系统校验结构，数据库不做约束

### 未来扩展字段提取路线

当某个 JSON 字段成为高频查询条件时：

```
JSON 中高频字段 → 独立列 + B-tree 索引 → 数据回填 → 代码切换读新列 → 清理 JSON 冗余
```

---

## 5. 未来字段说明

以下字段已在表设计中提前占位，当前使用 DEFAULT 或 NULL：

| 字段 | 所在表 | 启用阶段 | 功能 |
|---|---|---|---|
| `user_id` | 全部 7 表 | 多用户支持 | 用户隔离，当前全为 'default' |
| `animation_state` | memories, sessions, messages, connections | Phase 6 | 动画状态持久化 |
| `color` | folders, memories, sessions, connections | 当前已使用 | 用户或 AI 标记颜色 |
| `position` | memories | Phase 4 | 中列画布节点坐标 |
| `spatial_path` | connections | Phase 4 | 预计算连线贝塞尔曲线 |
| `embedding` | memories | 未来 | 向量检索（1536d） |
| `summary` | memories | 当前已使用 | AI 自动摘要 |
| `keywords` | memories | 当前已使用 | AI 生成关键词数组 |
| `preview` | memories | 未来 | 缩略图 data URL |

---

## 6. 表创建顺序

```
1. folders        (无外部依赖)
2. memories       (FK → folders)
3. sessions       (FK → folders)
4. messages       (FK → sessions)
5. connections    (无声明式 FK，应用层保证引用完整性)
6. settings       (无外部依赖)
7. files          (FK → memories, FK → folders)
8. file_contents  (PK = FK → files)
```

> MySQL 中 Drizzle 不强制创建外键。所有引用完整性由应用层保证。
