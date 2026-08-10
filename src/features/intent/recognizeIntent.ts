import type { IntentResult, IntentType } from "@/types";

/* ------------------------------------------------------------------ */
/*  Tier 1 — Rule-based patterns (zero latency, handles ~80%)          */
/* ------------------------------------------------------------------ */

const GREETING_RE =
  /^(你好|hi|hello|hey|在吗|嗨|早上好|晚上好|下午好|晚安|早啊|哈喽|嗨喽|hola|哟|嘿)[\s!！。.,，、?？]*$/i;

const GREETING_WORDS = [
  "你好", "hi", "hello", "hey", "在吗", "嗨", "早上好",
  "晚上好", "下午好", "晚安", "早啊", "哈喽", "嗨喽",
];

const MEMORY_SEARCH_TRIGGERS = [
  "找", "搜索", "有没有", "之前", "存过", "关于",
  "记得", "查", "帮我找", "帮我查", "看看有没有",
  "有存过", "存储过", "保存过", "上传过",
];

const SUMMARIZE_TRIGGERS = [
  "总结", "整理", "汇总", "归纳", "概括", "概述",
  "帮我总结", "帮我整理", "帮我归纳", "梳理",
];

const ANALYZE_TRIGGERS = [
  "分析", "联系", "关联", "模式", "规律", "特点",
  "对比", "比较", "趋势", "偏好", "习惯",
  "有什么联系", "有什么关联", "有什么规律",
];

/* ------------------------------------------------------------------ */
/*  Keyword extraction heuristics                                      */
/* ------------------------------------------------------------------ */

/**
 * Domain synonym map — expands common query terms to related keywords
 * for better retrieval matching against enriched memory keywords.
 */
const DOMAIN_EXPANSION: Record<string, string[]> = {
  前端: ["React", "Vue", "Next.js", "JavaScript", "TypeScript", "CSS", "HTML", "Web开发", "前端开发"],
  后端: ["Node.js", "Python", "Go", "数据库", "API", "微服务", "后端开发", "Serverless"],
  AI: ["人工智能", "机器学习", "深度学习", "LLM", "大模型", "NLP", "神经网络"],
  设计: ["UI", "UX", "Figma", "产品设计", "交互设计", "视觉设计"],
  创业: ["融资", "商业模式", "增长", "PMF", "MVP", "SaaS"],
  理财: ["投资", "股票", "基金", "财务自由", "资产配置", "储蓄"],
  心理: ["情绪", "认知", "正念", "冥想", "自我成长", "心理咨询"],
  健身: ["运动", "减脂", "增肌", "跑步", "瑜伽", "健康"],
  阅读: ["读书", "书单", "笔记", "知识管理", "学习方法"],
  写作: ["创作", "内容", "文案", "博客", "公众号"],
  摄影: ["拍照", "构图", "后期", "相机", "手机摄影"],
  音乐: ["作曲", "编曲", "乐器", "钢琴", "吉他", "听歌"],
};

/**
 * Extract meaningful search keywords from a user query.
 *
 * Strategy:
 * 1. Remove punctuation and special characters
 * 2. Remove stop words and function words
 * 3. For Chinese: keep words 2+ chars that aren't pure noise
 * 4. For English: keep technical terms
 * 5. Expand domain keywords using synonym map
 * 6. Deduplicate and cap at 15 keywords
 */
function extractKeywords(query: string): string[] {
  // Remove punctuation and special characters
  const cleaned = query.replace(
    /[，。！？、；：""''（）《》【】\[\]{}…\s,!.?;:'"()]+/g,
    " "
  ).trim();

  const stopWords = new Set([
    // Function words
    "我", "你", "他", "她", "它", "我们", "你们", "他们", "她们",
    "的", "了", "在", "是", "有", "和", "就", "都", "也", "还",
    "要", "会", "可以", "能", "能够", "这个", "那个", "哪个", "什么",
    "怎么", "怎么样", "为什么", "因为", "所以", "但是", "虽然",
    "帮我", "一下", "一个", "一些", "一点", "这种", "那种",
    "之前", "有没有", "能不能", "可不可以", "是否", "吗", "呢", "吧",
    // Action words (often noise for retrieval)
    "帮我找", "帮我查", "帮我搜索", "帮我看看", "搜索", "查找", "找一下",
    "帮我", "总结", "整理", "分析", "归纳", "告诉我", "说一下",
    "存过", "存储过", "保存过", "上传过", "关于",
    // Common noise words that shouldn't be used as keywords
    "是什么", "怎么做", "为什么", "怎么样", "好不好",
    "真的", "有点", "比较", "非常", "特别", "一直",
    "还是", "或者", "觉得", "认为", "知道", "希望",
    "需要", "想要", "应该", "可能", "一定", "必须",
  ]);

  // Split into words
  const rawWords = cleaned.split(/\s+/).filter((w) => w.length > 0);
  const keywords: string[] = [];

  for (const word of rawWords) {
    // Keep English/technical terms (2+ chars)
    if (/^[a-zA-Z0-9.#+/_-]{2,}$/.test(word)) {
      keywords.push(word);
      continue;
    }

    // For Chinese text: keep words 2+ chars that aren't stop words
    // No sliding window — it creates garbage 2-char chunks from compound terms
    if (!stopWords.has(word) && word.length >= 2) {
      keywords.push(word);
    }
  }

  // Phase 2: Domain expansion — add related keywords
  const expanded = new Set<string>(keywords.map((k) => k.toLowerCase()));
  for (const kw of keywords) {
    const expansions = DOMAIN_EXPANSION[kw];
    if (expansions) {
      for (const exp of expansions) {
        expanded.add(exp.toLowerCase());
      }
    }
  }

  return [...expanded].slice(0, 15);
}

/* ------------------------------------------------------------------ */
/*  Main recognition function                                          */
/* ------------------------------------------------------------------ */

export function recognizeIntent(query: string): IntentResult {
  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  // ── Greeting ──
  if (GREETING_RE.test(trimmed)) {
    return {
      intent: "greeting",
      confidence: 0.95,
      keywords: [],
      requiresMemories: false,
    };
  }

  // Check for short greeting-like messages
  if (
    trimmed.length <= 6 &&
    GREETING_WORDS.some((w) => lower.includes(w.toLowerCase()))
  ) {
    return {
      intent: "greeting",
      confidence: 0.9,
      keywords: [],
      requiresMemories: false,
    };
  }

  // ── Memory Search ──
  const searchMatch = MEMORY_SEARCH_TRIGGERS.some((t) => trimmed.includes(t));
  if (searchMatch) {
    return {
      intent: "memory_search",
      confidence: 0.85,
      keywords: extractKeywords(trimmed),
      requiresMemories: true,
    };
  }

  // ── Summarize ──
  const summarizeMatch = SUMMARIZE_TRIGGERS.some((t) => trimmed.includes(t));
  if (summarizeMatch) {
    return {
      intent: "summarize",
      confidence: 0.85,
      keywords: extractKeywords(trimmed),
      requiresMemories: true,
    };
  }

  // ── Analyze ──
  const analyzeMatch = ANALYZE_TRIGGERS.some((t) => trimmed.includes(t));
  if (analyzeMatch) {
    return {
      intent: "analyze",
      confidence: 0.85,
      keywords: extractKeywords(trimmed),
      requiresMemories: true,
    };
  }

  // ── Default: normal_chat ──
  // Still extract keywords — may be optionally used for retrieval
  return {
    intent: "normal_chat",
    confidence: 0.7,
    keywords: extractKeywords(trimmed),
    requiresMemories: false,
  };
}

/**
 * Tier 2 — LLM-based intent recognition for ambiguous queries.
 * Called when Tier 1 confidence is low or the caller wants a second opinion.
 */
export async function recognizeIntentLLM(query: string): Promise<IntentResult> {
  const prompt = `分析用户消息，判断意图并提取关键词。

意图类别：
- greeting: 问候、打招呼、寒暄
- memory_search: 搜索、查找之前存过的内容
- summarize: 要求总结、整理、归纳
- analyze: 要求分析、找出联系、发现规律
- normal_chat: 普通闲聊、询问建议、表达情绪

用户消息: "${query}"

返回JSON格式（不要其他内容）：
{"intent": "<intent_type>", "confidence": 0.0-1.0, "keywords": ["关键词1", "关键词2"]}`;

  try {
    const response = await fetch("/api/chat/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, temperature: 0.1, max_tokens: 256 }),
    });

    if (!response.ok) {
      // Fall back to rule-based
      console.warn("[intent] LLM classification failed, using rule-based fallback");
      return recognizeIntent(query);
    }

    const json = await response.json();
    if (json.fallback || json.error || !json.text) {
      return recognizeIntent(query);
    }

    const rawText = json.text.trim();
    // Try to parse JSON from response
    let parsed: { intent?: string; confidence?: number; keywords?: string[] } | null = null;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* fall through */ }
      }
    }

    if (parsed && isValidIntent(parsed.intent)) {
      return {
        intent: parsed.intent as IntentType,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
        keywords: Array.isArray(parsed.keywords) ? parsed.keywords : extractKeywords(query),
        requiresMemories: ["memory_search", "summarize", "analyze"].includes(parsed.intent),
      };
    }
  } catch (error) {
    console.error("[intent] LLM classification error:", error);
  }

  // Ultimate fallback
  return recognizeIntent(query);
}

function isValidIntent(s: unknown): s is IntentType {
  const valid: IntentType[] = ["greeting", "memory_search", "summarize", "analyze", "normal_chat"];
  return typeof s === "string" && valid.includes(s as IntentType);
}

/* ------------------------------------------------------------------ */
/*  Reference resolution                                                */
/* ------------------------------------------------------------------ */

const REFERENCE_PATTERNS: Array<{
  pattern: RegExp;
  resolver: (recentMessages: { role: string; content: string }[]) => string | null;
}> = [
  {
    // "这个" / "那个" / "它" → look for last mentioned topic
    pattern: /^(这个|那个|它|他们|它们)\s*.*$/,
    resolver: (msgs) => {
      const lastAssistant = msgs.filter((m) => m.role === "assistant").pop();
      if (lastAssistant) return lastAssistant.content.slice(0, 100);
      return null;
    },
  },
  {
    // "按你说的" / "就按这个" / "照你说的做"
    pattern: /^(按你说的|就按这个|照你说的|照这么做|就这么做|就按这个做)/,
    resolver: (msgs) => {
      const lastAssistant = msgs.filter((m) => m.role === "assistant").pop();
      if (lastAssistant) {
        return `基于你之前的建议: "${lastAssistant.content.slice(0, 150)}" — 请继续执行`;
      }
      return null;
    },
  },
  {
    // "继续" / "接着说" / "然后呢"
    pattern: /^(继续|接着说|然后呢|还有呢|然后|接下来)(\s*[!！。.,，、?？]*)?$/,
    resolver: () => "请继续上一轮的讨论，接着往下说",
  },
  {
    // Bare "需要" / "好的" / "嗯" / "可以"
    pattern: /^(需要|好的|嗯|可以|行|OK|ok|对|是的|没错)(\s*[!！。.,，、?？]*)?$/,
    resolver: (msgs) => {
      const lastAssistant = msgs.filter((m) => m.role === "assistant").pop();
      if (lastAssistant) {
        return `基于上文: "${lastAssistant.content.slice(0, 150)}" — ${lastAssistant.content.includes("需要") ? "确认需要" : "继续讨论"}`;
      }
      return null;
    },
  },
];

/**
 * Resolve referential expressions in user queries.
 *
 * Detects: 这个、那个、它、按你说的、继续、需要 (bare) etc.
 * Rewrites the query with context from recent messages when a reference is detected.
 *
 * @returns Resolved query (may be unchanged if no reference detected)
 */
export function resolveReferences(
  query: string,
  recentMessages: { role: string; content: string }[]
): string {
  const trimmed = query.trim();

  // Only check short queries (long queries are likely self-contained)
  if (trimmed.length > 30) return trimmed;

  for (const { pattern, resolver } of REFERENCE_PATTERNS) {
    if (pattern.test(trimmed)) {
      const context = resolver(recentMessages);
      if (context) {
        return `${context}\n\n[用户原话: ${trimmed}]`;
      }
      // If no context found, return unchanged
      return trimmed;
    }
  }

  return trimmed;
}
