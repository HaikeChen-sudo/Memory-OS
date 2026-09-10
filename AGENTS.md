# Memory OS — AI Agent 规则

> 本文档是迁移期 V1 代码的行为契约。V2 新模块遵循 `../MemoryOS-V2-Research-Architecture.md`；发生冲突时以 V2 为准。
> 最后更新：2026-08-10

---

## 1. 架构层级规则

### 依赖方向（严格单向）

```
components/  →  hooks/  →  features/  →  storage/  →  adapter (IndexedDB/MySQL)
     ↓            ↓
  stores/      types/
```

**禁止**：
- ❌ `components/` 直接 import `storage/` 或 `services/` 中的任何模块
- ❌ `features/` 直接 import `stores/`（会导致循环依赖）
- ❌ `hooks/` 直接 import `MySQLAdapter` 或 `IndexedDBAdapter`
- ❌ `types/` import 任何有副作用的模块

**允许**：
- ✅ `components/` import `hooks/`, `stores/`, `types/`, `components/shared/`
- ✅ `hooks/` import `features/`, `stores/`, `storage/` (仅 storage Proxy), `types/`
- ✅ `features/` import `storage/` (仅 storage Proxy), `services/`, `types/`, `lib/`
- ✅ `storage/` 内部文件互相 import，但不 import `features/` 或 `stores/`

### Storage 抽象层规则

所有数据读写必须通过 `storage` Proxy 单例：

```ts
import { storage } from "@/storage";

// ✅ 正确：通过 storage Proxy
const mem = await storage.readMemory(id);
await storage.saveMemory(memory);

// ❌ 错误：直接 import adapter
import { MySQLAdapter } from "@/storage/MySQLAdapter";  // 只在 /api/storage 路由中使用
```

**例外**：`/api/storage/route.ts` 可以直接使用 `MySQLAdapter`（它是唯一合法的直接消费者）。

---

## 2. 文件组织规则

### 新增文件规则

| 文件类型 | 放置位置 | 示例 |
|---|---|---|
| React 组件 | `src/components/{area}/{ComponentName}.tsx` | `workspace/left/Timeline.tsx` |
| 业务逻辑 | `src/features/{domain}/{moduleName}.ts` | `chat/answerReviewer.ts` |
| API 路由 | `src/app/api/{path}/route.ts` | `api/storage/route.ts` |
| 类型定义 | `src/types/{domain}.ts` | `types/analysis.ts` |
| 状态 Store | `src/stores/{name}Store.ts` | `stores/folderStore.ts` |
| React Hook | `src/hooks/use{Name}.ts` | `hooks/useChat.ts` |
| 存储适配器 | `src/storage/{Name}Adapter.ts` | `storage/MySQLAdapter.ts` |
| 服务封装 | `src/services/{domain}/{name}.ts` | `services/parser/doubao-ocr.ts` |
| 数据库 Schema | `src/db/schema.ts` | 所有表定义在一个文件 |
| 纯函数/配置 | `src/lib/{name}.ts` | `lib/ai-config.ts` |

### 不可修改的文件

以下文件在非 Phase 计划中不可修改：
- `src/app/layout.tsx` — 根布局
- `src/app/page.tsx` — Landing Page
- `src/components/landing/HeroCover.tsx` — 封面
- `src/components/workspace/left/` — 左列 UI 组件（除非 Phase 任务明确要求）
- `src/components/workspace/right/ChatMessage.tsx` — 消息组件
- `src/components/workspace/right/ChatInput.tsx` — 输入框组件

---

## 3. 编码规范

### TypeScript

- 所有新文件必须使用 TypeScript
- 禁止 `any`（除非有明确注释说明原因）
- 函数参数超过 2 个时使用对象参数
- 导出函数必须有 JSDoc 注释说明用途

### React 组件

- `"use client"` 指令必须放在文件第一行（如需要）
- 组件 Props 使用 interface（而非 type）
- 不写 inline style（使用 Tailwind class 或 CSS 变量）
- 组件只通过 props 接收数据，通过 callback 触发事件

### API Routes

- 所有 API 路由必须有输入验证
- 敏感 key 通过 `process.env` 读取（不加 `NEXT_PUBLIC_` 前缀）
- 不在 API 路由中做业务逻辑（调用 features 层）
- 错误响应统一格式：`{ error: string }`

### 状态管理

- UI 状态（列宽、选中项、筛选、上传队列）→ Zustand
- 服务端数据（memories、messages、chats）→ TanStack Query
- 两者不可混用：不要把服务端数据放在 Zustand 中

---

## 4. 安全规则

### API Key 保护

- **LLM API Key**：只能通过 `/api/chat/llm` 服务端路由调用，客户端永远不持有
- **数据库密码**：只在 `process.env.DATABASE_PASSWORD`（服务端），永不发送到客户端
- **豆包 API Key**：只在 `/api/ocr` 路由中使用

### 输入验证（强制）

- `/api/storage` 路由：必须验证 `collection` 在白名单中、`id` 长度 ≤ 64、payload 大小 ≤ 1MB
- 所有用户输入在写入数据库前必须做基本清洗（至少 trim）
- 文件上传必须校验类型和大小（`MemoryManager.validateInput()`）

### 安全底线

- ❌ 绝对不要在 `"use client"` 文件中读取 `process.env` 中的非 `NEXT_PUBLIC_` 变量
- ❌ 绝对不要在前端代码中硬编码任何 API key 或密码
- ❌ 绝对不要在 URL 参数中传递敏感数据
- ❌ 不要使用 `eval()` 或 `new Function()` 执行用户输入
- ❌ 不要将用户输入直接拼接进 SQL（Drizzle ORM 已防护，禁止写原始 SQL）

---

## 5. 性能规则

### 数据加载

- 记忆列表当前全量加载。未来数据增长时改用 `useInfiniteQuery` + cursor 分页
- ChatPanel 已实现分页显示（默认 30 条），仅渲染可见消息
- FileContent 已实现内存缓存（`MemoryStorage.fileContentCache`）

### 图片处理

- 上传图片在客户端压缩：max 1200×1200, JPEG quality 0.7
- OCR 请求用原图 base64（豆包需要原始质量）
- 压缩后的图片存为 `memory.content` 的 data URL

### 并发控制

- 文件解析（OCR/视频分析）并发数限制为 2（`MAX_PARSE_CONCURRENCY`）
- MySQL 连接池限制默认 10（`DATABASE_POOL_SIZE` env）
- LLM 调用有重试上限（`guardedCallLLM`: 最多 2 次重试）

---

## 6. 错误处理规则

### 降级策略（必须遵守）

| 故障点 | 降级行为 |
|---|---|
| LLM API 不可用 | `guardedCallLLM` → 2 次重试 → 友好降级消息 |
| 检索失败 | 返回最近 5 条记忆 |
| OCR 解析失败 | `parse_status = "error"`，不阻塞 UI |
| 对话摘要生成失败 | 静默跳过，继续使用完整对话历史 |
| 回答审核失败 | 静默通过（`reviewAnswer` 中 reviewer 错误不阻塞） |
| MySQL 连接失败 | ServerStorageAdapter 在 SSR 返回空数组 |
| IndexedDB 不可用 | ServerStorageAdapter 自动兜底 |

### 不应抛出的错误

- `parseFile()` / `analyzeVideoLink()` — fire-and-forget，永不应让用户感知
- `generateMemoryMetadata()` — fire-and-forget，永不应阻塞 UI
- `generateSummary()` — best-effort，永不应阻塞消息发送

---

## 7. 测试和调试规则

### 可观测性

- 每次 `answer()` 调用自动记录 `DebugLog`（token、延迟、意图、检索命中数、审核结果）
- debug 日志在 `chatStore.debugLogs` 中，保留最近 20 条
- `console.error` 已用于关键路径，添加新错误处理时必须包含足够的上下文字段

### 开发环境

- 使用 `.env.local` 管理本地环境变量
- `DATABASE_HOST` 默认 `127.0.0.1`
- AI Provider 自动检测顺序：`DEEPSEEK_API_KEY` → `OPENAI_API_KEY` → `ANTHROPIC_API_KEY`

---

## 8. 禁止的操作清单

### 架构破坏

- ❌ 在 `components/` 中 import `storage/` 的 adapter 类
- ❌ 在 `features/` 中 import Zustand stores
- ❌ 创建 `services/` 与 `features/` 之间的循环引用
- ❌ 绕过 `storage` Proxy 直接调用 adapter

### 功能破坏

- ❌ 修改 type 枚举值时不同步更新所有 switch/if 分支
- ❌ 修改 `Memory` 接口时不同步更新 `MemoryManager.create()` 的默认值
- ❌ 新增 `COLLECTIONS` 常量时不同步更新 `MySQLAdapter.TABLES` 和 `/api/storage` 白名单
- ❌ 修改 `/api/storage` 的 action 处理逻辑时不同步更新 `ServerStorageAdapter`

### UI 破坏

- ❌ 修改三列 Grid 布局
- ❌ 修改文件夹隔离机制 (`folder_id` / `storage.setCurrentFolder()`)
- ❌ 修改 `ChatPanel` 的乐观更新逻辑
- ❌ 修改暗色主题 CSS 变量

---

## 9. 必须同步更新的文件

当修改以下内容时，必须同步更新对应的多个文件：

| 修改内容 | 需同步更新的文件 |
|---|---|
| 新增数据库表 | `db/schema.ts`, `storage/types.ts` (COLLECTIONS), `storage/MySQLAdapter.ts` (TABLES + REQUIRED_DEFAULTS), `/api/storage` (ALLOWED_COLLECTIONS), `storage/IndexedDBAdapter.ts` (STORES) |
| 新增 Memory 字段 | `types/memory.ts`, `db/schema.ts`, `storage/MySQLAdapter.ts` (JSON_FIELDS), `features/memory/MemoryManager.ts` (create 默认值) |
| 新增 AI Pipeline 步骤 | `features/chat/answer.ts`, `features/index.ts` (barrel export), `types/chat.ts` (相关类型) |
| 新增加载/错误状态 | `stores/chatStore.ts` (如需要), `components/workspace/right/ChatPanel.tsx` (UI) |
| 修改文档 | 对应的 5 个 C3 md 文件 + 本文件 |

---

## 10. 项目文档索引

项目文档位于 `TextFile/C3/`：

| 优先级 | 文件 | 内容 |
|---|---|---|
| 1 | `MemoryOS-Upgrade-Plan.md` | 当前升级计划、实际模块清单、已完成变更、回滚方案 |
| 2 | `MemoryOS-Architecture.md` | 技术选型、组件树、状态管理、数据流、API 路由 |
| 3 | `project_map.md` | 目录结构、数据流全景、各层职责 |
| 4 | `Database-Design.md` | 8 表 ER 图、索引策略、JSON 序列化规范 |
| 5 | `memory-os/AGENTS.md` | 本文件 — AI 代理行为规则 |
