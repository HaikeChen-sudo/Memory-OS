# Memory OS — 架构升级计划

> V2 重铸已于 2026-08-10 获得授权。本文保留为 V1 迁移基线；新架构与新阶段以 `MemoryOS-V2-Research-Architecture.md` 为准。
> 最后更新：2026-08-10

---

## Phase 1 — 当前架构审查

### 实际模块清单（2026-06-05 快照）

```
src/
├── types/
│   ├── memory.ts          Memory, MemoryCreateInput, FileRecord, FileContent, TimeGroup
│   ├── chat.ts            Chat/Session, Message, Citation, RetrievalResult, AnswerResult, DebugLog
│   ├── connection.ts      Connection, ConnectionKind, ConnectionNodeType, SpatialPath
│   ├── folder.ts          Folder
│   ├── analysis.ts        AnalysisResult, AnalysisInsights, CrossDomainConnection
│   └── intent.ts          IntentType, IntentResult
│
├── features/
│   ├── chat/
│   │   ├── answer.ts             主管道：intent → retrieve → buildContext → LLM → review → parse
│   │   ├── answerReviewer.ts     回答审核器（快速关键词检查 + 深度 LLM 审核）
│   │   ├── contextBuilder.ts     Token 预算感知的上下文构建器（去重 + 近重复合并）
│   │   ├── conversationSummary.ts 长对话压缩摘要生成
│   │   ├── errorHandler.ts       优雅降级包装器
│   │   ├── responseGuard.ts      空响应检测 + 重试 + 降级
│   │   └── index.ts
│   ├── memory/
│   │   ├── MemoryManager.ts      记忆 CRUD + 图片压缩 + 文件解析调度 + 视频分析调度
│   │   └── index.ts
│   ├── retrieval/
│   │   ├── retrieve.ts           三层检索：关键词匹配 → 模糊匹配 → 内容子串匹配
│   │   └── index.ts
│   ├── parsing/
│   │   ├── parseFile.ts          图片/PDF OCR 编排 (doubao vision → 分块 → 存储 → memory.content 更新)
│   │   └── analyzeVideo.ts       视频链接分析编排 (API → 分块 → 存储 → memory.content 更新)
│   ├── intent/
│   │   └── recognizeIntent.ts    意图识别 (Tier 1 规则匹配 + Tier 2 LLM 分类) + 指代消解
│   ├── enrichment/
│   │   └── generateMetadata.ts   AI 关键词 + 摘要生成（OCR 完成后 fire-and-forget）
│   ├── analysis/
│   │   └── analyze.ts            深度分析引擎（结构化 JSON 输出 + 本地 fallback）
│   ├── debug/
│   │   └── debugLogger.ts        请求级可观测性日志
│   └── index.ts
│
├── storage/
│   ├── types.ts              StorageAdapter 接口, StorageMode, COLLECTIONS 常量
│   ├── MemoryStorage.ts      高层 API (文件夹范围 + FileContent 缓存)
│   ├── IndexedDBAdapter.ts   IndexedDB 实现（参考用，当前不使用）
│   ├── MySQLAdapter.ts       Drizzle ORM + MySQL 适配器（服务端）
│   ├── ServerStorageAdapter.ts 客户端→服务端 Proxy 适配器（POST /api/storage）
│   └── index.ts              Proxy 懒加载单例 + barrel export
│
├── stores/
│   ├── memoryStore.ts        memories[], uploadQueue, groupMemoriesByTime()
│   ├── chatStore.ts          activeChatId (localStorage 持久化), messages[], displayCount 分页
│   ├── uiStore.ts            三列宽度
│   └── folderStore.ts        folders[], activeFolderId
│
├── hooks/
│   ├── useMemories.ts        TanStack Query: CRUD + timeline 分组
│   ├── useChat.ts            TanStack Query: 聊天会话 + 消息发送（含对话摘要触发）
│   ├── useUpload.ts          文件上传进度管理
│   └── index.ts
│
├── components/
│   ├── landing/
│   │   └── HeroCover.tsx
│   ├── shared/
│   │   ├── TypeIcon.tsx
│   │   ├── TimeBadge.tsx
│   │   └── ErrorBoundary.tsx     React 错误边界
│   └── workspace/
│       ├── left/
│       │   ├── LeftPanel.tsx
│       │   ├── UploadZone.tsx
│       │   ├── Timeline.tsx
│       │   └── MemoryCard.tsx
│       ├── middle/
│       │   ├── MiddlePanel.tsx   占位 + 选中记忆详情入口
│       │   └── MemoryDetail.tsx  记忆详情面板（含 OCR 文本展示、重命名、删除）
│       └── right/
│           ├── ChatPanel.tsx     聊天面板（含乐观更新、无限滚动加载更多）
│           ├── ChatMessage.tsx
│           └── ChatInput.tsx
│
├── app/
│   ├── layout.tsx            根布局
│   ├── page.tsx              / → Landing
│   ├── providers.tsx          React Query Provider
│   ├── folders/
│   │   └── page.tsx          文件夹列表页面
│   ├── workspace/
│   │   └── [folderId]/
│   │       ├── layout.tsx     metadata
│   │       └── page.tsx       三列 Grid (含 ErrorBoundary)
│   └── api/
│       ├── chat/llm/route.ts     LLM 代理端点（API key 不泄露到客户端）
│       ├── storage/route.ts      存储代理端点（含集合白名单 + 输入校验）
│       ├── memories/route.ts     保留（云同步入口）
│       └── ocr/route.ts          豆包 Vision OCR 端点
│
├── db/
│   ├── schema.ts             Drizzle MySQL schema (8 表: folders, memories, sessions, messages, connections, settings, files, file_contents)
│   └── index.ts              MySQL2 连接池 + Drizzle 实例（含连接超时、池限制、优雅关闭）
│
├── lib/
│   └── ai-config.ts          AI provider 自动检测（DeepSeek → OpenAI → Anthropic）+ Vision 配置
│
├── services/
│   ├── parser/
│   │   ├── doubao-ocr.ts     豆包 doubao-seed-1-6-vision-250815 OCR 调用
│   │   └── chunk-text.ts     文本分块工具
│   └── video/
│       ├── analyze-video.ts  视频分析服务端
│       └── parse-url.ts      视频 URL 解析
```

### 已解决的耦合风险

| 风险点 | 原严重度 | 当前状态 | 说明 |
|---|---|---|---|
| 业务层直连数据库 | 高 | ✅ 已解决 | 所有数据操作走 `storage` Proxy → `ServerStorageAdapter` → `/api/storage` → `MySQLAdapter` |
| 聊天流单体式 | 高 | ✅ 已解决 | 分离为 `recognizeIntent` → `retrieve` → `buildContext` → `guardedCallLLM` → `reviewAnswer` → `parseCitations` |
| 类型散落 | 中 | ✅ 已解决 | Memory 使用 `position: {x,y,z}` 替代 `spatial_x/y/z`；新增 `keywords`、`metadata`、`embedding` |
| 无本地存储 | 高 | ✅ 已解决 | ServerStorageAdapter 同步维护 IndexedDB 副本和持久化 outbox；离线变更在服务恢复后按序重放 |
| 页面直调 API | 中 | ✅ 已解决 | ChatPanel 通过 `useCreateChat` hook 本地创建会话，走 storage 抽象层 |

### 当前技术债务

1. **无用户认证**：`/api/storage` 端点无认证，任何人可读/写/删数据。需添加 Auth middleware
2. **无速率限制**：LLM 代理和存储 API 均无速率限制，可能被滥用或产生高额 API 费用
3. **双向冲突策略未完成**：当前 outbox 保证本地变更单向回流 MySQL，多设备并发仍需版本向量或明确的冲突策略
4. **向量检索未实现**：当前为关键词匹配 + 内容子串匹配，无 embedding 语义检索
5. **消息流式渲染未实现**：LLM 响应为完整返回，非 SSE 逐 token 流式输出
6. **文件上传无进度条持久化**：UploadZone 进度依赖 Zustand 内存状态，刷新后丢失
7. **debugLogger 为模块级单例**：多标签页共享状态会相互覆盖
8. **parseFile/analyzeVideo 使用 CustomEvent 跨层通信**：缺少类型安全，隐式耦合组件
9. **Connection 表使用 source_id/target_id**：不支持多态关联（memory/message/source），与 DB 设计文档不一致

---

## Phase 2 — 存储重构

### 目标

Local First：所有用户数据默认存浏览器本地，云端为可选同步通道。

### 当前状态：已完成 ✅

- `StorageAdapter` 接口已定义（`storage/types.ts`）
- `IndexedDBAdapter` 已实现（8 个 Object Store）
- `MySQLAdapter` 已实现（Drizzle ORM + MySQL2 连接池、原生 Upsert、单事务导入）
- `ServerStorageAdapter` 已实现（客户端 fetch → `/api/storage`，同时维护 IndexedDB 副本和持久化 outbox）
- `MemoryStorage` 高层 API 已封装（文件夹范围 + FileContent 缓存）
- Proxy 懒加载单例已就位（SSR 安全降级）
- `/api/storage` 端点已就绪（含集合白名单 + 输入校验）

### 待完成

- [x] ServerStorageAdapter 内启用 IndexedDB 本地副本和离线写入重放
- [ ] 实现多设备双向同步与冲突解决策略
- [ ] 添加 import/export UI

---

## Phase 3 — AI 管线升级

### 目标

聊天 → 检索 → 回答 → 引用，多步分离。每个阶段可独立测试/替换。

### 当前状态：已完成 ✅（超预期）

| 步骤 | 文件 | 说明 |
|---|---|---|
| 0. 指代消解 | `intent/recognizeIntent.ts` — `resolveReferences()` | 解析"这个""继续""按你说的"等指代 |
| 1. 意图识别 | `intent/recognizeIntent.ts` — `recognizeIntent()` | 规则 Tier 1 + LLM Tier 2 fallback，5 种意图 |
| 2. 检索 | `retrieval/retrieve.ts` — `retrieve()` + `retrieveByContent()` | 关键词匹配 → 模糊匹配 → 内容子串（含文件内容自动加载） |
| 3. 上下文构建 | `chat/contextBuilder.ts` — `buildContext()` | Token 预算感知、去重、近重复合并（Jaccard） |
| 4. LLM 调用 | `chat/answer.ts` — `callLLMWithMessages()` | 客户端→`/api/chat/llm` 代理，服务端直连 LLM API |
| 5. 响应守护 | `chat/responseGuard.ts` — `guardedCallLLM()` | 空响应检测 + 最多 2 次重试 + 降级消息 |
| 6. 回答审核 | `chat/answerReviewer.ts` — `reviewAnswer()` | 快速关键词检查 + 低置信度深度 LLM 审核 |
| 7. 引用解析 | `chat/answer.ts` — `parseCitations()` | 提取 `[ref:MEMORY_ID]`，过滤未检索到的记忆 |
| 8. 对话摘要 | `chat/conversationSummary.ts` — `generateSummary()` | 10+ 轮对话自动触发摘要压缩 |
| 9. 可观测性 | `debug/debugLogger.ts` | 每次请求记录 token、延迟、意图、检索命中数 |

### 请求生命周期（实际）

```
用户输入 query
       │
       ▼
  resolveReferences(query, conversationHistory)   ← 指代消解
       │
       ▼
  recognizeIntent(resolvedQuery)                  ← 意图识别（规则 + LLM）
       │
       ▼
  retrieve(keywords, allMemories)                  ← 三层检索
       ├─ 关键词匹配（enriched memories）
       ├─ 内容匹配（raw memories + 文件内容自动加载）
       └─ 回退：最近记忆
       │
       ▼
  buildContext({ systemPrompt, sources, conversationHistory, summary })
       ├─ 去重 + 近重复合并（Jaccard > 0.8）
       ├─ Token 预算：system 20%, knowledge 60%, conversation 20%
       └─ 每块记忆含 title + content/OCR text + summary + keywords
       │
       ▼
  guardedCallLLM(prompt, temp)
       ├─ 客户端：fetch /api/chat/llm → LLM API
       ├─ 服务端：直接 fetch LLM API
       └─ 空响应：重试 + 降级消息
       │
       ▼
  reviewAnswer(raw, sources) [低置信度时]
       ├─ 快速关键词检查（零成本）
       └─ 深度 LLM 审核（仅 confidence < 0.5）
       │
       ▼
  parseCitations(raw, memories, allowedIds)
       ├─ 提取 [ref:ID]，过滤未检索到的记忆
       └─ 替换为 [来源: 标题]
       │
       ▼
  addDebugLog() → AnswerResult
```

### 接口稳定性

`retrieve()` 和 `answer()` 的函数签名已锁定。未来升级检索算法时调用方无需修改。

### System Prompts（4 种意图各不同）

| 意图 | Prompt 文件 | 风格 |
|---|---|---|
| greeting / normal_chat | `BASE_SYSTEM_PROMPT` | 温暖、幽默、朋友式 |
| memory_search | `MEMORY_SEARCH_PROMPT` | 准确引用、串联内容 |
| summarize | `SUMMARIZE_PROMPT` | 结构化笔记、关键洞察 |
| analyze | `ANALYZE_PROMPT` | 深度模式识别、跨领域关联 |

---

## Phase 4 — 数据模型升级

### 当前状态：已完成 ✅

- Memory 类型统一（`position: {x,y,z}` 替代 `spatial_x/y/z`）
- 新增 `keywords: string[] | null`、`metadata: Record<string, unknown>`
- 新增 `folder_id` 字段（文件夹隔离）
- `MemoryType` 新增 `"pdf"` 值
- FileRecord / FileContent 类型已定义（解析管线）
- IntentType / IntentResult 类型已定义
- AnalysisResult 类型已定义

### 待完成

- [ ] Connection 表改为多态（`from_type/from_id` + `to_type/to_id`）以支持 memory↔message 关联
- [ ] 实际数据回填 embedding 向量

---

## Phase 5 — UI 重构

### 当前状态：正在进行中

- ✅ ChatPanel 通过 `useCreateChat` 本地创建会话（不再 fetch API）
- ✅ 三列布局保持不变
- ✅ 中列 `MiddlePanel` 含 `MemoryDetail` 详情面板（含 OCR 文本、重命名、删除）
- ✅ Workspace 路由改为 `[folderId]` 动态参数
- ✅ 新增 `/folders` 页面（文件夹列表 + 创建 + 删除）
- ✅ 各列包裹 `ErrorBoundary`（单列崩溃不影响其他列）
- ✅ ChatPanel 含乐观更新 + 无限滚动加载更多

### 组件树（实际）

```
App (layout.tsx)
├── Providers (React Query)
│   ├── / (page.tsx)
│   │   └── HeroCover
│   │
│   ├── /folders (page.tsx)
│   │   └── 文件夹列表 + 创建/删除
│   │
│   └── /workspace/[folderId] (page.tsx)
│       └── Grid (useUIStore 列宽)
│           ├── ErrorBoundary → LeftPanel
│           │   ├── 文件夹切换
│           │   ├── UploadZone
│           │   └── Timeline → MemoryCard[]
│           │
│           ├── ErrorBoundary → MiddlePanel
│           │   └── MemoryDetail (选中记忆时)
│           │
│           └── ErrorBoundary → ChatPanel
│               ├── ChatMessage[] (含无限滚动)
│               └── ChatInput
```

---

## Phase 6 — 动画清理

### 当前状态：已完成 ✅

- 删除未执行任何逻辑的 `animations/` 空壳目录
- 现有交互继续使用组件内 CSS transition 与 keyframes
- 真正出现跨组件布局动画需求时再评估动画库

---

## Phase 7 — 迁移策略

### 已完成的架构变更清单

| 类型 | 数量 | 详情 |
|---|---|---|
| **新增文件** | 22+ | `storage/`(5), `features/`(14+), `db/`(2), `components/shared/ErrorBoundary.tsx`(1), `types/`(3: analysis, intent, folder) |
| **修改文件** | 12+ | `types/`(3), `hooks/`(3), `api/chat/llm/route.ts`, `api/storage/route.ts`, `ChatPanel.tsx`, `parseFile.ts`, `analyzeVideo.ts`, `ai-config.ts`, `db/index.ts` |
| **删除/废弃** | 8+ | `animations/`(5 个空壳文件), `services/parser/image-ocr.ts`(Tesseract), `services/parser/pdf-extractor.ts`(unpdf), `services/supabase/`(4 文件) |
| **未修改文件** | 20+ | Landing、左列组件、中列 MiddlePanel、右列 ChatMessage/ChatInput、`services/ai/rag.ts`、`app/layout.tsx`、`app/page.tsx` |

### 复杂度评估

| 阶段 | 复杂度 | 风险 | 实际状态 |
|---|---|---|---|
| Phase 2 (存储) | 中 | 低 | ✅ 完成，MySQL 后端 + 集合白名单 |
| Phase 3 (AI 管线) | 中→高 | 中→低 | ✅ 完成，9 步管线 + 质量守护 |
| Phase 4 (数据模型) | 低 | 低 | ✅ 完成，folder_id + keywords + metadata |
| Phase 5 (UI) | 低 | 极低 | ✅ 完成，ErrorBoundary + 乐观更新 |
| Phase 6 (动画) | 极低 | 无 | ✅ 完成，删除空壳，保留 CSS 动效 |

### 回滚计划

```
问题场景                          回滚操作
──────────────────────────────────────────────────────
IndexedDB 初始化失败              ServerStorageAdapter 自动兜底（通过 /api/storage）
storage Proxy 服务端报错           Proxy 内部处理，SSR 返回空数组/空值
answer() LLM 超时                  guardedCallLLM 重试 2 次 → 降级消息
answer() 审核未通过                reviewAnswer 自动修正(低置信度时)
类型不兼容旧代码                    spatial_x/y/z 已迁移为 position.x/y/z
导入数据版本不兼容                 版本号校验，version > 1 拒绝导入并提示升级
MySQL 连接池溢出                   connectionLimit + connectTimeout + 队列等待
大请求攻击 /api/storage            集合白名单 + payload 大小限制 + id 长度限制

极端回滚：
  git checkout <pre-upgrade-tag>
  npm run build
  → 恢复升级前的全部代码
```

### 未来接入点清单

| 能力 | 接入文件 | 改动方式 |
|---|---|---|
| 云同步 | `storage/index.ts` | 替换单例为 `IndexedDBAdapter` 或 hybrid adapter |
| 向量检索 | `features/retrieval/retrieve.ts` | 替换内部实现，函数签名不变 |
| 流式回答 | `features/chat/answer.ts` | 改为 SSE generator，ChatPanel 加 StreamingText |
| 复杂动画 | 对应组件 + `globals.css` | 先用 CSS；出现布局编排需求后再评估动画库 |
| 关系画布 | `MiddlePanel.tsx` | 替换占位为 `RelationshipCanvas` |
| 用户认证 | `app/api/` middleware | 添加 Auth middleware + rate limiting |
| 主题切换 | `globals.css` | 追加 `[data-theme="light"]` CSS 块 |
| 移动端 | `app/workspace/[folderId]/page.tsx` | Grid 切换为单列 + TabBar |
| 多态 Connection | `db/schema.ts` + `types/connection.ts` | 添加 from_type/from_id/to_type/to_id |

### 当前构建状态

```
▲ Next.js 16.2.6 (Turbopack)
✓ Compiled successfully
✓ TypeScript passed
✓ All routes generated

Route (app)
┌ ○ /                    Landing
├ ○ /_not-found
├ ○ /folders             文件夹列表
├ ƒ /api/chat/llm         LLM 代理
├ ƒ /api/storage          存储代理
├ ƒ /api/memories         云同步保留入口
├ ƒ /api/ocr              豆包 OCR 代理
└ ƒ /workspace/[folderId]  三列工作区 (动态路由)
```
