# Memory OS — 项目地图

> 本文是 V1 运行地图。V2 新模块和目标目录见 `MemoryOS-V2-Research-Architecture.md`。
> 最后更新：2026-08-10

## 这个项目是干什么的

Memory OS 是一个 **AI 记忆助手**。用户可以按文件夹管理内容，上传各种内容（图片、PDF、文本、链接、视频），AI 会自动 OCR/分析、生成关键词和摘要。用户在聊天中基于这些记忆内容进行对话、检索、总结和深度分析。

---

## 用户进入哪里

**`/` → Landing Page（全屏黑底封面 + "ENTER" 按钮）**

↓

**`/folders` → 文件夹列表页（创建/选择/删除文件夹）**

↓

## 页面在哪

**`/workspace/[folderId]` → 三列工作区（按文件夹隔离数据）**

| 左列 (30%) | 中列 (35%) | 右列 (35%) |
|---|---|---|
| 文件选择器 + 上传区 (拖拽/粘贴) | 记忆详情 (选中时: OCR文本、元数据、重命名、删除) | AI 聊天面板 |
| 时间线 (今天/昨天/本周...) | 关系画布 (MVP 占位) | 消息列表 (含无限滚动) + 输入框 |

---

## 数据从哪来

1. **用户上传** — 拖拽文件（图片/PDF/视频链接）到左列上传区，或粘贴文字/URL
2. **用户输入** — 在右列聊天框发送消息
3. **AI 生成** — LLM 返回的回复、摘要、引用标注 (`[ref:memory_id]`)
4. **AI 分析** — 豆包 Vision OCR 提取图片/PDF 文字、关键词生成、摘要生成
5. **AI 深度分析** — 跨记忆主题分布、矛盾、时间线模式、用户画像

---

## 处理逻辑在哪

| 层 | 路径 | 做什么 |
|---|---|---|
| 状态管理 | `src/stores/` | Zustand：UI 状态 + 应用缓存（memoryStore, chatStore, uiStore, folderStore） |
| 服务端缓存 | `src/hooks/` | TanStack Query 桥接，服务端数据读写（useMemories, useChat, useUpload） |
| 业务编排 | `src/features/` | 聊天管线 (answer → responseGuard → answerReviewer)、记忆管理 (MemoryManager)、检索 (retrieve)、意图识别 (recognizeIntent)、深度分析 (analyze)、元数据生成 (generateMetadata) |
| AI 代理 | `src/app/api/chat/llm/` | LLM 代理端点，API key 不暴露到客户端 |
| 存储代理 | `src/app/api/storage/` | 存储代理端点，客户端通过 ServerStorageAdapter → fetch → MySQL |
| 豆包 OCR | `src/app/api/ocr/` + `src/services/parser/doubao-ocr.ts` | 图片/PDF 文本识别：原图 base64 直传 → doubao-seed-1-6-vision-250815 → 去杂纯文本 |
| 视频分析 | `src/services/video/` | 视频链接分析：调用豆包 vision API 提取文本 |
| 本地存储适配 | `src/storage/` | StorageAdapter 接口 + IndexedDB 本地副本 + ServerStorageAdapter outbox + MySQLAdapter |
| 数据库 | `src/db/` | MySQL2 连接池 + Drizzle ORM schema（8 表） |
| AI 配置 | `src/lib/ai-config.ts` | Provider 自动检测（DeepSeek → OpenAI → Anthropic）+ Vision 配置 |
| 工具函数 | `src/utils/` | 通用工具、文本分块、格式化 |
| 类型 | `src/types/` | TypeScript 类型定义（memory, chat, connection, folder, analysis, intent） |

---

## 存到哪里

| 存储目标 | 内容 |
|---|---|
| **MySQL** | 全部业务数据：folders, memories, sessions, messages, connections, files, file_contents, settings |
| **IndexedDB (浏览器本地)** | ServerStorageAdapter 的在线副本与离线降级存储；待同步变更由持久化 outbox 回流 MySQL |

---

## 最后显示在哪

回到 `/workspace/[folderId]` 三列：

- **左列** → 时间线分组显示记忆卡片 (`MemoryCard`)，按今天/昨天/本周/本月分组
- **中列** → 选中记忆时显示详情 (`MemoryDetail`)：OCR/分析文本、类型、创建时间、重命名、删除
- **右列** → AI 聊天消息 (`ChatMessage`)，包含引用标签、加载更多历史消息

---

## 目录清单

### `src/app/`

```
src/app/
├── layout.tsx              # 根布局：metadata、字体、全局 Provider
├── page.tsx                # / → Landing Page
├── providers.tsx            # React Query Provider 注入
├── globals.css              # Tailwind 指令、CSS 变量、全局 reset
├── folders/
│   └── page.tsx             # /folders → 文件夹列表（创建/选择/删除）
├── workspace/
│   └── [folderId]/
│       ├── layout.tsx       # metadata
│       └── page.tsx         # /workspace/[folderId] → 三列 Grid + ErrorBoundary
└── api/
    ├── chat/
    │   └── llm/route.ts     # POST → LLM 代理（含 provider 自动检测）
    ├── storage/
    │   └── route.ts         # POST → 存储代理（含集合白名单 + 输入校验）
    ├── memories/
    │   └── route.ts         # 保留（云同步入口）
    └── ocr/
        └── route.ts         # POST → 豆包 Vision OCR
```

**作用**：Next.js App Router。只放路由文件，不做业务逻辑。`page.tsx` 是入口，`api/` 是 BFF 层。

---

### `src/components/`

```
src/components/
├── landing/
│   └── HeroCover.tsx         # 封面 + 呼吸灯 ENTER 按钮
├── workspace/
│   ├── left/
│   │   ├── LeftPanel.tsx     # 左列根组件（文件夹切换 + 上传 + 时间线）
│   │   ├── UploadZone.tsx    # 拖拽/粘贴上传区
│   │   ├── Timeline.tsx      # 时间线列表
│   │   └── MemoryCard.tsx    # 单条记忆卡片（含 OCR 状态轮询）
│   ├── middle/
│   │   ├── MiddlePanel.tsx   # 中列根组件（MemoryDetail 容器）
│   │   └── MemoryDetail.tsx  # 记忆详情面板（OCR 文本、重命名、删除）
│   └── right/
│       ├── ChatPanel.tsx     # 聊天面板（乐观更新 + 无限滚动）
│       ├── ChatMessage.tsx   # 单条消息
│       └── ChatInput.tsx     # 输入框
└── shared/
    ├── TypeIcon.tsx          # 内容类型图标
    ├── TimeBadge.tsx         # 时间标签
    └── ErrorBoundary.tsx     # React 错误边界
```

**作用**：纯 UI 组件。按页面/区域分组，不写业务逻辑，通过 props 接收数据，通过 callback 触发事件。

---

### `src/features/`

```
src/features/
├── chat/
│   ├── answer.ts             # AI 回答主管道 (resolveRefs → intent → retrieve → buildContext → LLM → review → parse)
│   ├── answerReviewer.ts     # 回答质量审核（快速关键词 + 深度 LLM 审核）
│   ├── contextBuilder.ts     # Token 预算感知的上下文构建器（去重 + 近重复合并）
│   ├── conversationSummary.ts # 长对话压缩摘要（10+ turns 自动触发）
│   ├── errorHandler.ts       # 优雅降级包装器
│   ├── responseGuard.ts      # 空响应检测 + 重试 + 降级消息
│   └── index.ts
├── memory/
│   ├── MemoryManager.ts      # 记忆 CRUD + 图片压缩 + 文件解析调度 + 视频分析调度
│   └── index.ts
├── retrieval/
│   ├── retrieve.ts           # 三层检索：关键词匹配 → 模糊匹配 → 内容子串匹配
│   └── index.ts
├── parsing/
│   ├── parseFile.ts          # 图片/PDF OCR 编排 (doubao vision → 分块 → 存储)
│   └── analyzeVideo.ts       # 视频链接分析编排
├── intent/
│   └── recognizeIntent.ts    # 意图识别 (Tier 1 规则 + Tier 2 LLM) + 指代消解
├── enrichment/
│   └── generateMetadata.ts   # AI 关键词 + 摘要生成（fire-and-forget）
├── analysis/
│   └── analyze.ts            # 深度分析引擎（结构化 JSON + 本地 fallback）
├── debug/
│   └── debugLogger.ts        # 请求级可观测性日志（token、延迟、意图）
└── index.ts                  # barrel export
```

**作用**：业务逻辑编排。编排多个 service/storage 完成一个用例。组件通过 hooks 间接调用 features。

---

### `src/storage/`

```
src/storage/
├── types.ts                  # StorageAdapter 接口, StorageMode, COLLECTIONS 常量
├── MemoryStorage.ts          # 高层 API（文件夹范围 + FileContent 缓存）
├── IndexedDBAdapter.ts       # IndexedDB 本地副本（8 Object Store）
├── MySQLAdapter.ts           # Drizzle ORM + MySQL 原生 Upsert、事务导入
├── ServerStorageAdapter.ts   # fetch 代理 + 本地副本 + 持久化 outbox
└── index.ts                  # Proxy 懒加载单例 + SSR 安全降级
```

**作用**：存储抽象层。业务层只调用 `storage.*`，不感知底层是 IndexedDB 还是 MySQL。

---

### `src/db/`

```
src/db/
├── schema.ts                 # Drizzle ORM MySQL schema（8 表）
└── index.ts                  # MySQL2 连接池 + Drizzle 实例 + closeDb()
```

---

### `src/stores/`

```
src/stores/
├── memoryStore.ts            # 记忆列表、类型筛选、选中项、上传队列、时间分组函数
├── chatStore.ts              # 当前对话 (localStorage 持久化)、消息列表、分页、流式状态、对话摘要、debug 日志
├── uiStore.ts                # 三列宽度
└── folderStore.ts            # 文件夹列表、当前活跃文件夹
```

---

### `src/hooks/`

```
src/hooks/
├── useMemories.ts            # 记忆 CRUD（React Query + memoryStore 桥接）
├── useChat.ts                # 聊天消息发送 + 流式接收 + 对话摘要触发
├── useUpload.ts              # 文件上传 + 进度管理
└── index.ts
```

---

### `src/types/`

```
src/types/
├── memory.ts                 # Memory, MemoryCreateInput, FileRecord, FileContent, TimeGroup
├── chat.ts                   # Chat/Session, Message, Citation, RetrievalResult, AnswerResult, DebugLog
├── connection.ts             # Connection, ConnectionKind, ConnectionNodeType, SpatialPath
├── folder.ts                 # Folder
├── analysis.ts               # AnalysisResult, AnalysisInsights, CrossDomainConnection
├── intent.ts                 # IntentType, IntentResult
└── index.ts
```

---

### `src/services/`

```
src/services/
├── ai/
│   └── rag.ts                # RAG pipeline (保留，当前使用 features/ 管线)
├── parser/
│   ├── doubao-ocr.ts         # 豆包 Vision API 调用
│   └── chunk-text.ts         # 文本分块工具
└── video/
    ├── analyze-video.ts      # 视频分析服务端逻辑
    └── parse-url.ts          # 视频 URL 解析
```

## 数据流全景

```
用户操作（上传 / 聊天 / 选择文件夹）
        │
        ▼
┌──────────────────┐
│   components/    │  ← 用户交互入口
└────────┬─────────┘
         │ 调用
         ▼
┌──────────────────┐
│    hooks/        │  ← 薄封装，桥接 state + api
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────┐
│stores/ │ │features/  │  ← 状态 + 业务编排
└────┬───┘ └────┬──────┘
     │          │
     │     ┌────┴──────────┐
     │     ▼               ▼
     │ ┌──────────┐  ┌──────────────┐
     │ │storage/  │  │  services/    │
     │ │(抽象层) │  │  AI/OCR/视频   │
     │ └────┬─────┘  └──────┬───────┘
     │      │               │
     └──────┴───────────────┘
            │
       ┌────┴──────────┐
       ▼               ▼
┌─────────────┐  ┌──────────────────┐
│ /api/storage │  │ /api/chat/llm    │
│ /api/ocr     │  │ /api/video/*     │
│ (BFF 代理层) │  │ (BFF 代理层)     │
└──────┬──────┘  └────────┬─────────┘
       │                  │
       ▼                  ▼
┌─────────────┐  ┌──────────────────┐
│   MySQL      │  │  LLM / Vision API │
│  (Drizzle)   │  │  (DeepSeek/OpenAI/│
│              │  │   Anthropic/豆包) │
└─────────────┘  └──────────────────┘
       │
       ▼
  数据返回，反向流回：
  MySQL → /api/storage → storage → features/hooks → components → 用户看到
```
