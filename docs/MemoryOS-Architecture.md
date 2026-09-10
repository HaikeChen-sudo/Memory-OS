# Memory OS — MVP 架构设计文档

> 本文描述正在运行的 V1 Web 架构。V2 目标架构见 `MemoryOS-V2-Research-Architecture.md`，冲突时以 V2 为准。
> 设计原则：MVP 只求功能跑通，但架构分层、组件边界、数据流全部按后期全量功能预留。砍功能不砍架构。
> 最后更新：2026-08-10

---

## 1. 技术架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (Browser)                      │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ 左列     │  │ 中列     │  │ 右列     │  │ 全局状态   │  │
│  │ 上传+    │  │ 记忆详情 │  │ AI 聊天  │  │ Zustand    │  │
│  │ 时间线   │  │ (占位)   │  │          │  │ + React    │  │
│  │          │  │          │  │          │  │ Query      │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘  │
│       │              │              │              │         │
│  ┌────┴──────────────┴──────────────┴──────────────┴─────┐  │
│  │                  Shared Component Layer                │  │
│  │  MemoryCard · TypeIcon · TimeBadge · ErrorBoundary     │  │
│  │  UploadDropZone · ChatMessage · ChatInput             │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           │                                  │
│  │  视觉反馈由组件内 CSS transition 与 keyframes 实现      │  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼  fetch /api/*
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes (BFF)                  │
│                                                              │
│  /api/storage  │  /api/chat/llm  │  /api/ocr  │  /api/memories  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           AI Pipeline (features/)                     │   │
│  │  intent → retrieve → buildContext → LLM → guard       │   │
│  │  → review → parseCitations → debugLog               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌──────────────────────┐   ┌──────────────────────────┐
│      MySQL            │   │    LLM API                │
│  (via mysql2 + Drizzle)│   │  DeepSeek / OpenAI /     │
│  8 tables             │   │  Anthropic (auto-detect)  │
│  连接池 + 超时        │   └──────────────────────────┘
└──────────────────────┘   ┌──────────────────────────┐
                           │    豆包 Vision API         │
                           │  doubao-seed-1-6-vision   │
                           │  (图片/PDF OCR + 去杂)     │
                           └──────────────────────────┘
```

### 技术选型理由（实际）

| 层 | 选型 | 理由 |
|---|---|---|
| 框架 | Next.js 16 (App Router, Turbopack) | SSR 可选、API 同仓库、动态路由 |
| 语言 | TypeScript strict | 类型安全贯穿前后端 |
| 样式 | Tailwind CSS + CSS Variables | 原子化快速开发，暗色主题 |
| 动画 | CSS transition + keyframes | 当前交互量不需要额外运行时依赖 |
| 状态管理 | Zustand + TanStack Query | Zustand 管 UI 状态，React Query 管服务端缓存 |
| 数据库 | MySQL (via mysql2 + Drizzle ORM) | 8 表、连接池管理、JSON 列序列化 |
| AI (Chat) | DeepSeek / OpenAI / Anthropic 自动检测 | Provider 优先级：DeepSeek → OpenAI → Anthropic |
| AI (Embedding) | 未启用 | 关键词匹配替代，未来接入 text-embedding-3-small |
| AI (OCR) | 豆包 doubao-seed-1-6-vision-250815 | 图片/PDF 前端原图直传，prompt 内嵌去杂 |
| AI (视频分析) | 豆包 doubao-seed-1-6-vision-250815 | `/api/video/analyze` 端点 |
| 部署 | Vercel / 自托管 | Next.js 原生支持 |

---

## 2. 页面结构

```
/                              → Landing Page (全屏黑色封面 + ENTER 按钮)
/folders                       → 文件夹列表（创建/选择/删除）
/workspace/[folderId]          → 工作区（三列布局，按文件夹隔离数据）
```

### Landing Page — 不变

```
┌───────────────────────────────────────────────────┐
│                                                   │
│                   M E M O R Y                     │
│                      O  S                         │
│                                                   │
│              ┌─────────────────┐                  │
│              │     E N T E R    │                  │
│              └─────────────────┘                  │
└───────────────────────────────────────────────────┘
```

### Folders Page — 新增

```
┌───────────────────────────────────────────────────┐
│                   M E M O R Y                     │
│                      O  S                         │
│                                                   │
│              ┌─────────────────┐                  │
│              │  📁 工作项目     │                  │
│              │  📁 学习笔记     │                  │
│              │  📁 个人生活     │                  │
│              ├─────────────────┤                  │
│              │ + 创建新文件夹   │                  │
│              └─────────────────┘                  │
└───────────────────────────────────────────────────┘
```

### Workspace（三列布局）

```
┌──────────────┬───────────────┬──────────────┐
│   左列 (30%)  │  中列 (35%)   │  右列 (35%)   │
│              │               │              │
│  ┌────────┐  │  记忆详情     │  ┌──────────┐│
│  │ 上传区  │  │  - OCR 文本  │  │ AI Chat  ││
│  │ 拖拽/   │  │  - 元数据    │  │          ││
│  │ 选择    │  │  - 重命名    │  │ 消息列表 ││
│  └────────┘  │  - 删除      │  │          ││
│              │               │  ├──────────┤│
│  ┌────────┐  │               │  │ 输入框   ││
│  │时间线   │  │               │  └──────────┘│
│  │ 今天   │  │               │              │
│  │ 昨天   │  │               │              │
│  │ 本周   │  │               │              │
│  └────────┘  │               │              │
└──────────────┴───────────────┴──────────────┘
```

- 三列使用 CSS Grid `grid-template-columns: 30% 35% 35%`
- 列宽通过 Zustand `uiStore` 管理
- 各列独立包裹 `ErrorBoundary`，单列崩溃不影响其他列
- 左列内部纵向 flex：文件夹选择器 + 上传区（固定高）+ 时间线（flex-1 滚动）
- 右列内部纵向 flex：消息列表（flex-1 滚动，含无限滚动加载）+ 输入框（固定底部）

---

## 3. 状态管理设计

### Zustand Store 划分（实际）

```
stores/
├── memoryStore.ts      # 记忆列表、上传队列、选中项、时间分组派生函数
├── chatStore.ts        # 当前对话ID(localStorage持久化)、消息列表、流式状态、分页加载、对话摘要
├── uiStore.ts          # 三列宽度
└── folderStore.ts      # 文件夹列表、当前活跃文件夹ID
```

> **注意**：`relationshipStore.ts` 不存在。关系画布未实现，未来需创建。

### memoryStore

```
字段:
  memories: Memory[]
  selectedTypes: MemoryType[]
  selectedMemoryId: string | null
  uploadQueue: UploadTask[]

动作:
  setMemories(memories)
  addMemory(memory)
  removeMemory(id)
  selectMemory(id)
  addToUploadQueue(item)
  updateUploadProgress(id, progress)
  removeFromUploadQueue(id)

导出函数:
  groupMemoriesByTime(memories): TimeGroup[]
```

### chatStore

```
字段:
  activeChatId: string | null       ← localStorage 持久化
  messages: Message[]
  isStreaming: boolean
  isAnalyzing: boolean
  displayCount: number              ← 分页显示数量（默认30）
  isLoadingMore: boolean
  conversationSummary: string | null
  debugLogs: DebugLog[]

动作:
  setActiveChat(chatId)             ← 切换时清空 messages、displayCount、summary
  setMessages(messages)             ← 排序 + 重置分页
  addMessage(message)               ← 追加 + 更新 displayCount
  setIsStreaming(streaming)
  setIsAnalyzing(analyzing)
  setConversationSummary(summary)
  addDebugLog(log)                  ← 保留最近 20 条
  clearDebugLogs()
  loadMoreMessages()                ← 分页加载更多（每次+30条）
  resetDisplayCount()
```

### uiStore

```
字段:
  leftColumnWidth: 30
  middleColumnWidth: 35
  rightColumnWidth: 35
```

### folderStore

```
字段:
  folders: Folder[]
  activeFolderId: string | null

动作:
  setFolders(folders)
  addFolder(folder)
  setActiveFolder(id)
```

### TanStack Query 缓存键设计（实际）

```
['memories', folderId, type?]              → 某文件夹的记忆列表
['messages', sessionId]                    → 某对话的消息列表
['chats', folderId]                        → 某文件夹的对话列表
```

> **关键设计**：服务端状态（memories、messages）全部走 React Query 缓存，UI 状态（列宽、选中项、筛选、上传队列）走 Zustand。两者不混用。

---

## 4. 数据流设计

### 4.1 上传流（实际）

```
用户拖拽文件 / 粘贴链接
       │
       ▼
UploadZone 组件
  → useUpload hook
  → 写入 uploadQueue (Zustand)
       │
       ▼
useCreateMemory mutation
  → memoryManager.create(input)
  → 前端校验（类型、大小限制）
  → 图片压缩（max 1200×1200, JPEG 0.7）
  → 创建 Memory 对象 + 写入 storage
       │
       ▼ (fire-and-forget, 并发限制 2)
  ├─ image/pdf → parseFile()
  │   → POST /api/ocr (doubao vision)
  │   → chunkText() 分块
  │   → storage.saveFileContent()
  │   → 更新 memory.content = extractedText
  │   → dispatchEvent("ocr-complete")
  │   → fire-and-forget generateMemoryMetadata() (关键词+摘要)
  │
  └─ video_link → analyzeVideoLink()
      → POST /api/video/analyze (doubao vision)
      → chunkText() 分块
      → storage.saveFileContent()
      → 更新 memory.content = extractedText
      → dispatchEvent("ocr-complete")
      → fire-and-forget generateMemoryMetadata()

前端 React Query invalidate ['memories']
  → 时间线自动刷新
```

### 4.2 聊天 + RAG 流（实际）

```
用户在右列输入消息
       │
       ▼
ChatInput → ChatPanel.handleSend()
  → 乐观更新 UI（立即显示用户消息）
       │
       ▼
useSendMessage mutation
  → sendMessage(sessionId, content)
  → storage.saveMessage(userMessage)
  → storage.readAllMemories(folderId)
  → storage.readMessagesBySession(sessionId) → conversationHistory
  → (可选) generateSummary() 当 turns >= 10
       │
       ▼
answer(query, allMemories, { conversationHistory, conversationSummary })
  → resolveReferences(query, history)           ← P0: 指代消解
  → recognizeIntent(query)                      ← P1: 意图识别
  → retrieve(keywords, allMemories)             ← P2: 三层检索
  → buildContext({ ... })                       ← P3: Token 预算构建
  → guardedCallLLM(prompt, temp)               ← P4: LLM + 守护
  → reviewAnswer(raw, sources, confidence)     ← P5: 审核 (低置信度时)
  → parseCitations(raw, sources)               ← P6: 引用解析
  → addDebugLog()                               ← P7: 可观测性
       │
       ▼
  → storage.saveMessage(aiMessage)
  → React Query invalidate ['messages']
  → ChatPanel 显示 AI 响应
```

### 4.3 解析管线数据流

```
文件上传 → MemoryManager.create()
  → 创建 Memory (content = base64 或 "pdf:filename")
  → 创建 FileRecord (parse_status = "pending")
  → scheduleParse() / scheduleVideoAnalysis() (并发限制 2)

后台：
  parseFile() / analyzeVideoLink()
  → updateStatus("parsing")
  → fileToBase64DataURL() (原图，不压缩)
  → POST /api/ocr 或 /api/video/analyze
  → chunkText(extractedText)
  → storage.saveFileContent({ extracted_text, chunks })
  → 更新 memory.content (仅当 content 仍为占位值时)
  → updateStatus("done")
  → dispatchEvent("ocr-complete", { memoryId })
  → fire-and-forget generateMemoryMetadata()

组件侧：
  MemoryCard / MemoryDetail 监听 "ocr-complete" 事件
  → 轮询 storage.readFileContent() (最多 5 次，间隔 3s)
  → 显示 extracted_text
```

---

## 5. 文件目录结构（实际）

```
memory-os/
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 根布局
│   │   ├── page.tsx                  # / → Landing Page
│   │   ├── providers.tsx             # React Query Provider
│   │   ├── globals.css               # Tailwind + CSS 变量
│   │   ├── folders/
│   │   │   └── page.tsx              # 文件夹列表
│   │   ├── workspace/
│   │   │   └── [folderId]/
│   │   │       ├── layout.tsx        # metadata
│   │   │       └── page.tsx          # 三列 Grid + ErrorBoundary
│   │   └── api/
│   │       ├── chat/llm/route.ts     # LLM 代理
│   │       ├── storage/route.ts      # 存储代理
│   │       ├── memories/route.ts     # 保留（云入口）
│   │       └── ocr/route.ts          # 豆包 OCR
│   │
│   ├── components/
│   │   ├── landing/
│   │   │   └── HeroCover.tsx
│   │   ├── workspace/
│   │   │   ├── left/
│   │   │   │   ├── LeftPanel.tsx
│   │   │   │   ├── UploadZone.tsx
│   │   │   │   ├── Timeline.tsx
│   │   │   │   └── MemoryCard.tsx
│   │   │   ├── middle/
│   │   │   │   ├── MiddlePanel.tsx
│   │   │   │   └── MemoryDetail.tsx
│   │   │   └── right/
│   │   │       ├── ChatPanel.tsx
│   │   │       ├── ChatMessage.tsx
│   │   │       └── ChatInput.tsx
│   │   └── shared/
│   │       ├── TypeIcon.tsx
│   │       ├── TimeBadge.tsx
│   │       └── ErrorBoundary.tsx
│   │
│   ├── features/
│   │   ├── chat/
│   │   │   ├── answer.ts
│   │   │   ├── answerReviewer.ts
│   │   │   ├── contextBuilder.ts
│   │   │   ├── conversationSummary.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── responseGuard.ts
│   │   │   └── index.ts
│   │   ├── memory/
│   │   │   ├── MemoryManager.ts
│   │   │   └── index.ts
│   │   ├── retrieval/
│   │   │   ├── retrieve.ts
│   │   │   └── index.ts
│   │   ├── parsing/
│   │   │   ├── parseFile.ts
│   │   │   └── analyzeVideo.ts
│   │   ├── intent/
│   │   │   └── recognizeIntent.ts
│   │   ├── enrichment/
│   │   │   └── generateMetadata.ts
│   │   ├── analysis/
│   │   │   └── analyze.ts
│   │   ├── debug/
│   │   │   └── debugLogger.ts
│   │   └── index.ts
│   │
│   ├── storage/
│   │   ├── types.ts
│   │   ├── MemoryStorage.ts
│   │   ├── IndexedDBAdapter.ts
│   │   ├── MySQLAdapter.ts
│   │   ├── ServerStorageAdapter.ts
│   │   └── index.ts
│   │
│   ├── stores/
│   │   ├── memoryStore.ts
│   │   ├── chatStore.ts
│   │   ├── uiStore.ts
│   │   └── folderStore.ts
│   │
│   ├── hooks/
│   │   ├── useMemories.ts
│   │   ├── useChat.ts
│   │   ├── useUpload.ts
│   │   └── index.ts
│   │
│   ├── db/
│   │   ├── schema.ts
│   │   └── index.ts
│   │
│   ├── lib/
│   │   └── ai-config.ts
│   │
│   ├── services/
│   │   ├── ai/rag.ts
│   │   ├── parser/
│   │   │   ├── doubao-ocr.ts
│   │   │   └── chunk-text.ts
│   │   └── video/
│   │       ├── analyze-video.ts
│   │       └── parse-url.ts
│   │
│   ├── types/
│   │   ├── memory.ts
│   │   ├── chat.ts
│   │   ├── connection.ts
│   │   ├── folder.ts
│   │   ├── analysis.ts
│   │   ├── intent.ts
│   │   └── index.ts
│   │
│
├── public/
├── .env.local
├── drizzle.config.ts
├── next.config.ts
├── tsconfig.json
└── package.json
```

---

## 6. 动画策略

| 模块 | 路径 | 当前实现 | 扩展条件 |
|---|---|---|---|
| MemoryCard | `left/MemoryCard.tsx` | CSS transition | 需要布局编排时再引入动画库 |
| Timeline | `left/Timeline.tsx` | 静态列表 | 实现折叠和重排后评估布局动画 |
| HeroCover | `landing/HeroCover.tsx` | CSS keyframes | 保持纯 CSS |
| ChatMessage | `right/ChatMessage.tsx` | 静态渲染 | 流式输出完成后评估入场动画 |
| ErrorBoundary | `shared/ErrorBoundary.tsx` | 静态组件 | 不需要动画 |

---

## 7. MVP 阶段砍掉的内容（现状）

| 砍掉 | 状态 | 后期接入 |
|---|---|---|
| 中列关系画布 | 📍 占位中 | `MiddlePanel.tsx` → `RelationshipCanvas` |
| 视频/音频内嵌播放 | 📍 只存链接 + 分析文本 | 后期 `VideoCard`/`AudioCard` |
| 网页元数据提取 | 📍 只存 URL | API 加 `/api/link-preview` |
| 用户认证 | ❌ 无 | 加 Auth middleware |
| 向量检索 | ❌ 关键词匹配 | 替换 `retrieve()` 实现 |
| 流式响应的打字机效果 | ❌ 全量返回 | 改 SSE + StreamingText |
| 分页/无限滚动 (记忆列表) | ❌ 全量加载 | hooks 改用 `useInfiniteQuery` |
| 响应式/移动端 | ❌ | Media Query 单列 Tab |
| 暗色/亮色切换 | ❌ 只暗色 | `uiStore.theme` 已预留 |
| 记忆编辑/删除 UI | ✅ MemoryDetail 已实现 | 中列详情面板含重命名 + 删除 |
| 对话历史管理 | 📍 单对话 + localStorage 持久化 | 后期左列对话列表 |
| 文件夹管理 | ✅ 已实现 | `/folders` 页面 + folderStore |

---

## 8. 关键架构决策记录

### 为什么 MySQL 替代 Supabase
Supabase 需要额外服务部署。MySQL 更通用，Drizzle ORM 提供类型安全的查询构建。迁移回 Supabase 只需替换 adapter。

### 为什么用 ServerStorageAdapter 代理模式
客户端不直接连数据库。所有存储操作通过 `POST /api/storage`，服务端 `MySQLAdapter` + Drizzle ORM 执行。客户端同时写 IndexedDB 副本；网络或 MySQL 故障时，变更进入 localStorage outbox，恢复后先按序重放再读取服务器。切换存储后端只需替换 adapter 实现。

### 为什么 Storage Proxy 要处理 SSR
Next.js App Router 在服务端预渲染时会执行组件代码。Proxy 检测 `typeof window === "undefined"` 自动返回安全默认值，避免 SSR 时报错。

### CSS Variables 主题系统
```
:root {
  --color-bg:        #000000;
  --color-surface:   #111111;
  --color-border:    #1a1a1a;
  --color-text:      #e0e0e0;
  --color-text-dim:  #666666;
  --color-accent:    #3b82f6;
  --color-accent-glow: rgba(59, 130, 246, 0.3);
}
```
所有组件引用 `var(--color-*)`，后期加亮色主题只需追加 `[data-theme="light"]` 块。

### 为什么 AI 管线拆分成多个独立模块
每步可独立测试和替换：
- `recognizeIntent()` — 可换 LLM 分类器
- `retrieve()` — 可换向量检索
- `buildContext()` — 可调 Token 预算
- `guardedCallLLM()` — 独立的守护逻辑
- `reviewAnswer()` — 可开关的质量审核
- `parseCitations()` — 引用格式可配置

### 为什么用 CustomEvent 进行跨层通信
parseFile/analyzeVideo 是后台任务，完成后通过 `window.dispatchEvent(new CustomEvent("ocr-complete", ...))` 通知 UI。这避免了 features 层直接依赖 stores 或 hooks。缺点：无类型安全、隐式耦合。未来应改用 Zustand store 事件或 TanStack Query invalidation。

### 为什么 chatStore.activeChatId 持久化到 localStorage
用户刷新页面后恢复上次的对话。恢复时先读取 Session 并校验 `session.folder_id` 是否匹配当前路由；校验通过前不加载或渲染旧消息，跨文件夹会创建独立会话。
