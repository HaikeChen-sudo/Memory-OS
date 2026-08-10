import { retrieve, retrieveByContent } from "@/features/retrieval/retrieve";
import { recognizeIntent, resolveReferences } from "@/features/intent/recognizeIntent";
import { buildContext } from "@/features/chat/contextBuilder";
import { guardedCallLLM } from "@/features/chat/responseGuard";
import { reviewAnswer } from "@/features/chat/answerReviewer";
import { getAIConfig } from "@/lib/ai-config";
import { addDebugLog, createTimer } from "@/features/debug/debugLogger";
import type { Memory, AnswerResult, Citation, RetrievalResult, DebugLog } from "@/types";

/* ------------------------------------------------------------------ */
/*  System Prompts (intent-aware)                                       */
/* ------------------------------------------------------------------ */

const BASE_SYSTEM_PROMPT = `你是用户的长期记忆助手，也是一个真正理解用户的朋友。你不仅仅是检索数据，而是理解数据背后的意义。

你的知识来源：
1. 用户的个人记忆 — 用户存储的内容，这是你最独特的知识
2. 你的通用知识 — 你对世界的广泛了解

核心原则：
- 你不是数据库查询工具，你是"理解用户的人"——先去理解用户为什么问这个，再去调用相关记忆
- 记忆不是用来罗列的，是用来理解的——把记忆里的内容和用户当下的问题串联起来，给出有洞察的回应
- 当记忆中有相关内容时，自然地融入，像在聊一件你们都熟悉的事
- 当没有相关记忆时，用你的通用知识回答，不要反复说你"没有找到"或"你没存过"
- 永远不要编造记忆内容，也不要拒绝回答

边界——绝对禁止（违反即不合格）：
- 禁止主动引导用户去存储更多内容——比如"要不要存进来？""建议你以后存一下"
- 禁止提议抛开记忆聊别的——比如"我们换个话题吧""不聊记忆也可以"
- 禁止在没有来源依据时凭空给用户提建议、推荐行动、预测未来
- 你的回答必须扎根于两个来源（用户记忆 + 通用知识），不要聊来源以外的东西

交流风格：
- 像一个聪明、温暖、有点幽默感的朋友，不是客服也不是学术秘书
- 适当用口语化表达，偶尔带点俏皮，但不要过度
- 不要每句话都提"记忆"、"数据库"、"存储"这些词
- 用户打招呼或闲聊时，自然地回应，别急着翻记忆
- 用户表达情绪时，先共情，再思考要不要调用记忆来回应
- 回答可以有自己的节奏和个性，不必每次都端端正正

回答方式：
- 先理解用户想问什么，再决定怎么回答——别上来就翻记忆
- 调用记忆时自然融入，比如"你之前提到过..."、"我记得你存过一篇..."
- 把记忆当聊天素材，不是答题依据
- 需要标注来源时用 [ref:MEMORY_ID] 格式`;

const MEMORY_SEARCH_PROMPT = `用户正在查找他们之前存储的内容。你不是搜索引擎，而是帮用户理解和串联这些内容的伙伴。

准则：
- 先看看找到的内容之间有什么关联，再组织回答
- 准确引用记忆内容，用 [ref:MEMORY_ID] 标注来源
- 有直接答案就清晰给出，只找到部分就诚实说明
- 找不到相关内容时友好告知，用通用知识补充
- 用自然的语言来组织，像在聊天中帮朋友回忆事情，别列清单

边界：
- 不要建议用户"以后可以存什么相关内容"——这不在你的职责范围内`;

const SUMMARIZE_PROMPT = `用户需要你帮忙梳理和总结他们存储的内容。你不是在写报告，而是帮朋友理清思路。

方法：
1. 先通读所有内容，找到共同主题和线索
2. 按主题分组，找出内容之间的关联和逻辑
3. 把最重要的点提炼出来，不要太啰嗦
4. 如果发现有趣的对比或矛盾，指出来——这往往比罗列更有价值

输出：
- 结构化但不死板，像一篇有洞察的笔记
- 用 [ref:MEMORY_ID] 标注来源
- 有数据就说数据（百分比、数量、时间跨度）
- 末尾可以加一句"关键洞察"——用一两句话说清楚这些内容真正在讲什么
- 语调轻松但内容扎实

边界：
- 总结的是用户已有的内容，不要在此基础上给用户提建议或推荐行动`;

const ANALYZE_PROMPT = `你是用户的深度思考伙伴。用户需要你透过表面内容看到更深层的模式和联系。

基于提供的用户记忆，进行结构化深度分析：

分析维度：
1. 主题分布：用户关注的内容集中在哪些领域？各占多少比例？
2. 共同线索：跨不同记忆是否存在重复出现的主题、观点或模式？
3. 矛盾与张力：不同记忆之间是否存在不一致或矛盾的观点？
4. 时间演进：用户关注的话题是否随时间发生了变化？
5. 用户画像：从这些内容中能看出用户的什么偏好、价值观、思维特点？
6. 跨领域关联：不同领域的知识之间是否存在有趣的连接？

输出要求：
- 不要简单罗列"A、B、C"，要展开分析，给出有深度的洞察
- 用数据支撑你的分析（如百分比、数量、时间跨度）
- 指出"为什么这些联系有意义"
- 使用 [ref:MEMORY_ID] 标注信息来源
- 语调：像一个聪明的朋友在和你讨论你的知识库，而不是在写学术论文

边界：
- 分析的是内容中已呈现的事实和模式，不是让你给用户的人生提建议
- 所有结论必须有记忆内容作为依据，不要凭空推测`;

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface AnswerOptions {
  maxContext?: number;
  temperature?: number;
  /** Recent conversation messages (full role+content pairs) */
  conversationHistory?: { role: "user" | "assistant"; content: string }[];
  /** Pre-generated conversation summary for long conversations */
  conversationSummary?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Main pipeline                                                       */
/* ------------------------------------------------------------------ */

export async function answer(
  query: string,
  allMemories: Memory[],
  options: AnswerOptions = {}
): Promise<AnswerResult> {
  const totalTimer = createTimer();
  const { maxContext = 10, temperature, conversationHistory = [], conversationSummary = null } = options;

  // P0: Resolve referential expressions
  const resolvedQuery = resolveReferences(query, conversationHistory);

  // Step 1: Recognize user intent
  const intentResult = recognizeIntent(resolvedQuery);
  const { intent, keywords } = intentResult;

  // Step 2: Retrieve relevant memories (top-K only, no full injection)
  let retrievalMs = 0;
  const retrievalTimer = createTimer();
  let sources: RetrievalResult[] = [];

  try {
    sources = await doRetrieve(keywords, allMemories, maxContext, intent);
    retrievalMs = retrievalTimer.elapsed();
  } catch (error) {
    console.error("[answer] Retrieval failed:", error);
    sources = [];
    retrievalMs = retrievalTimer.elapsed();
  }

  // Select system prompt by intent
  const systemPrompt = selectSystemPrompt(intent);

  // Step 3: Build context with token budget + dedup
  const ctxResult = buildContext({
    systemPrompt,
    conversationHistory,
    conversationSummary,
    sources,
    intent,
  });

  // Step 4: Get temperature
  const effectiveTemperature = temperature ?? getDefaultTemperature(intent);

  // Step 5: Call LLM with guard (retry on empty)
  let retryCount = 0;
  const llmTimer = createTimer();
  let rawResponse: string;

  try {
    // Build full prompt string for the guarded call
    const promptStr = ctxResult.messages
      .map((m) => `${m.role === "system" ? "System" : m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    const finalPrompt = `${promptStr}\n\nUser: ${resolvedQuery}\nAssistant:`;

    rawResponse = await guardedCallLLM(
      (p, t) => {
        retryCount++;
        return callLLMWithMessages(ctxResult.messages, resolvedQuery, t);
      },
      finalPrompt,
      effectiveTemperature,
      { query: resolvedQuery, sources }
    );
    // Adjust retryCount (starts at 1 for initial call)
    retryCount = retryCount - 1;
  } catch (error) {
    console.error("[answer] LLM call failed:", error);
    rawResponse = generateLocalAnswer(resolvedQuery, sources);
  }

  const llmMs = llmTimer.elapsed();

  // Step 6: Review answer quality
  let reviewerPassed: boolean | null = null;
  const confidence = computeConfidence(sources);

  if (sources.length > 0 && confidence < 0.5) {
    try {
      const review = await reviewAnswer(
        rawResponse,
        sources,
        resolvedQuery,
        confidence,
        (p, t) => callLLMPlain(p, t)
      );
      reviewerPassed = review.passed;
      if (!review.passed && review.correctedAnswer) {
        rawResponse = review.correctedAnswer;
      }
    } catch {
      // Reviewer failure is non-blocking
    }
  }

  // Step 7: Parse citations
  const sourceMemoryIds = new Set(sources.map((s) => s.memory.id));
  const { cleanText } = parseCitations(rawResponse, sources.map((s) => s.memory), sourceMemoryIds);

  // Step 8: Log debug info
  const debugLog: DebugLog = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
    query: resolvedQuery,
    intent,
    retrievedCount: sources.length,
    retrievedMemoryIds: sources.map((s) => s.memory.id),
    systemTokens: ctxResult.debug.systemTokens,
    conversationTokens: ctxResult.debug.conversationTokens,
    knowledgeTokens: ctxResult.debug.knowledgeTokens,
    promptTokens: ctxResult.debug.totalTokens,
    responseTokens: Math.ceil(cleanText.length / 2),
    retrievalMs,
    llmMs,
    totalMs: totalTimer.elapsed(),
    usedFallback: rawResponse.includes("⚠️") || rawResponse.includes("降级"),
    reviewerPassed,
    retryCount,
    timestamp: new Date().toISOString(),
  };
  addDebugLog(debugLog);

  return {
    answer: cleanText,
    sources,
    confidence: Math.round(confidence * 100) / 100,
    sourceCount: sources.length,
    sourceTime: new Date().toISOString(),
    intent,
    memoriesUsed: sources.length > 0,
  };
}

/* ------------------------------------------------------------------ */
/*  Retrieval helper                                                    */
/* ------------------------------------------------------------------ */

async function doRetrieve(
  keywords: string[],
  allMemories: Memory[],
  maxResults: number,
  intent: string
): Promise<RetrievalResult[]> {
  // For greetings, don't waste time retrieving
  if (intent === "greeting") return [];
  if (allMemories.length === 0) return [];

  // If no keywords extracted, fall back to recent memories directly
  if (keywords.length === 0) {
    return getRecentMemories(allMemories, maxResults);
  }

  // Layer 1: Keyword matching with fuzzy support
  const results = await retrieve(keywords, allMemories, {
    maxResults,
    minRelevance: 0.03, // lowered from 0.1 — any signal is useful
  });

  // Layer 2: If few results, try content-based matching
  if (results.length < 3 && keywords.length > 0) {
    const queryText = keywords.join(" ");
    const contentResults = await retrieveByContent(queryText, allMemories, {
      maxResults: maxResults - results.length,
      minRelevance: 0.05, // lowered from 0.08
    });
    // Merge, dedup by memory.id
    const seen = new Set(results.map((r) => r.memory.id));
    for (const cr of contentResults) {
      if (!seen.has(cr.memory.id)) {
        results.push(cr);
        seen.add(cr.memory.id);
      }
    }
  }

  // Layer 3: If still empty and user clearly wants memory access,
  // OR if it's any non-greeting intent, provide recent memories as context
  if (results.length === 0 && allMemories.length > 0) {
    return getRecentMemories(allMemories, 5);
  }

  return results.slice(0, maxResults);
}

function getRecentMemories(memories: Memory[], count: number): RetrievalResult[] {
  return [...memories]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, count)
    .map((m) => ({
      memory: m,
      relevance: 0.05,
      matchedSnippet: m.title,
    }));
}

/* ------------------------------------------------------------------ */
/*  System prompt selection                                             */
/* ------------------------------------------------------------------ */

function selectSystemPrompt(intent: string): string {
  switch (intent) {
    case "memory_search":
      return MEMORY_SEARCH_PROMPT;
    case "summarize":
      return SUMMARIZE_PROMPT;
    case "analyze":
      return ANALYZE_PROMPT;
    default:
      return BASE_SYSTEM_PROMPT;
  }
}

function getDefaultTemperature(intent: string): number {
  switch (intent) {
    case "greeting":
      return 0.9;
    case "memory_search":
      return 0.3;
    case "summarize":
      return 0.4;
    case "analyze":
      return 0.5;
    default:
      return 0.7;
  }
}

function computeConfidence(sources: RetrievalResult[]): number {
  if (sources.length === 0) return 0;
  return sources.reduce((sum, s) => sum + s.relevance, 0) / sources.length;
}

/* ------------------------------------------------------------------ */
/*  LLM calling (multi-turn messages)                                   */
/* ------------------------------------------------------------------ */

async function callLLMWithMessages(
  contextMessages: { role: string; content: string }[],
  userQuery: string,
  temperature: number
): Promise<string> {
  const messages = [
    ...contextMessages,
    { role: "user", content: userQuery },
  ];

  if (typeof window === "undefined") {
    return callLLMServerMulti(messages, temperature);
  }
  return callLLMClientMulti(messages, temperature);
}

/** Simple prompt-based call (for reviewer, summary gen) — no multi-turn context needed */
async function callLLMPlain(prompt: string, temperature: number): Promise<string> {
  if (typeof window === "undefined") {
    return callLLMServerSingle(prompt, temperature);
  }
  return callLLMClientSingle(prompt, temperature);
}

async function callLLMServerMulti(
  messages: { role: string; content: string }[],
  temperature: number
): Promise<string> {
  const config = getAIConfig();
  if (config.provider === "none") {
    return generateLocalAnswer("", []);
  }

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.chatModel,
        messages,
        max_tokens: 2048,
        temperature,
      }),
    });

    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error(`[${config.provider}] LLM multi call failed:`, error);
    return "";
  }
}

async function callLLMClientMulti(
  messages: { role: string; content: string }[],
  temperature: number
): Promise<string> {
  try {
    const response = await fetch("/api/chat/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, temperature }),
    });

    const json = await response.json();
    if (json.fallback || json.error) {
      return generateLocalAnswer("", []);
    }
    return json.text || "";
  } catch (error) {
    console.error("LLM client multi call failed:", error);
    return "";
  }
}

async function callLLMServerSingle(prompt: string, temperature: number): Promise<string> {
  const config = getAIConfig();
  if (config.provider === "none") return "";

  const parts = prompt.split("\n\nUser:");
  const systemContent = parts[0] || prompt;
  const userContent = parts[1]?.replace("\nAssistant:", "") || "";

  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.chatModel,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        max_tokens: 1024,
        temperature,
      }),
    });
    const json = await response.json();
    return json.choices?.[0]?.message?.content || "";
  } catch {
    return "";
  }
}

async function callLLMClientSingle(prompt: string, temperature: number): Promise<string> {
  try {
    const response = await fetch("/api/chat/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, temperature }),
    });
    const json = await response.json();
    return json.text || "";
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Local fallback                                                      */
/* ------------------------------------------------------------------ */

function generateLocalAnswer(query: string, sources: RetrievalResult[]): string {
  if (sources.length === 0) {
    const q = query || "";
    if (/^(你好|hi|hello|在吗|嗨|早上好|晚上好|下午好|晚安|早啊|哈喽)/i.test(q)) {
      return "你好！很高兴见到你～";
    }
    if (/^(谢谢|多谢|感谢|thanks|thank)/i.test(q)) {
      return "不客气！";
    }
    return "抱歉，我现在无法连接到 AI 服务。请检查网络或 API 配置后重试。";
  }

  const titles = sources.map((s) => `- ${s.memory.title}`).join("\n");
  return `我找到了以下相关内容：\n\n${titles}\n\n但 AI 服务暂不可用，无法生成详细回答。请检查 API 配置。`;
}

/* ------------------------------------------------------------------ */
/*  Citation parsing                                                    */
/* ------------------------------------------------------------------ */

function parseCitations(
  text: string,
  memories: Memory[],
  allowedIds: Set<string>
): { cleanText: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const memoryMap = new Map(memories.map((m) => [m.id, m]));

  const cleanText = text.replace(/\[ref:([a-f0-9-]+)\]/g, (_, memoryId) => {
    if (!allowedIds.has(memoryId)) return "";
    const memory = memoryMap.get(memoryId);
    citations.push({
      memory_id: memoryId,
      source_id: null,
      text_snippet: memory?.title || "",
      strength: 1,
      position_in_message: null,
    });
    return `[来源: ${memory?.title || memoryId}]`;
  });

  return { cleanText, citations };
}
