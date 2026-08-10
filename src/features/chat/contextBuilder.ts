import type { RetrievalResult } from "@/types";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface ContextDebug {
  systemTokens: number;
  conversationTokens: number;
  knowledgeTokens: number;
  totalTokens: number;
  budgetExceeded: boolean;
  memoriesUsed: number;
  memoriesDropped: number;
}

interface ContextParams {
  systemPrompt: string;
  conversationHistory: { role: "user" | "assistant"; content: string }[];
  conversationSummary: string | null;
  sources: RetrievalResult[];
  intent: string;
  maxTokens?: number;
}

interface ContextResult {
  messages: { role: string; content: string }[];
  debug: ContextDebug;
}

/* ------------------------------------------------------------------ */
/*  Token estimation                                                     */
/* ------------------------------------------------------------------ */

/** Rough token estimation: Chinese ~2 chars/token, English ~4 chars/token */
function estimateTokens(text: string): number {
  let tokens = 0;
  for (const char of text) {
    // CJK characters
    if (/[一-鿿㐀-䶿]/.test(char)) {
      tokens += 0.5; // ~2 chars per token
    } else {
      tokens += 0.25; // ~4 chars per token
    }
  }
  return Math.ceil(tokens);
}

/* ------------------------------------------------------------------ */
/*  Deduplication                                                       */
/* ------------------------------------------------------------------ */

/** Deduplicate sources by memory.id */
function deduplicateSources(sources: RetrievalResult[]): RetrievalResult[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.memory.id)) return false;
    seen.add(s.memory.id);
    return true;
  });
}

/** Simple Jaccard similarity for detecting near-duplicate text */
function jaccardSimilarity(a: string, b: string): number {
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = new Set([...aWords].filter((w) => bWords.has(w)));
  const union = new Set([...aWords, ...bWords]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

/** Merge near-duplicate sources */
function mergeNearDuplicates(sources: RetrievalResult[]): RetrievalResult[] {
  const result: RetrievalResult[] = [];
  for (const s of sources) {
    let isDuplicate = false;
    for (const r of result) {
      if (jaccardSimilarity(s.memory.content, r.memory.content) > 0.8) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) result.push(s);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/*  Context building                                                     */
/* ------------------------------------------------------------------ */

export function buildContext(params: ContextParams): ContextResult {
  const {
    systemPrompt,
    conversationHistory,
    conversationSummary,
    sources,
    intent,
    maxTokens = 8192,
  } = params;

  const debug: ContextDebug = {
    systemTokens: 0,
    conversationTokens: 0,
    knowledgeTokens: 0,
    totalTokens: 0,
    budgetExceeded: false,
    memoriesUsed: 0,
    memoriesDropped: 0,
  };

  // Token budgets
  const systemBudget = Math.floor(maxTokens * 0.2); // 20%
  const knowledgeBudget = Math.floor(maxTokens * 0.6); // 60%
  const conversationBudget = Math.floor(maxTokens * 0.2); // 20%

  // ── 1. System Prompt ──
  let systemContent = systemPrompt;
  if (conversationSummary) {
    systemContent = `[对话摘要: ${conversationSummary}]\n\n${systemContent}`;
  }
  let systemTokens = estimateTokens(systemContent);
  if (systemTokens > systemBudget) {
    // Trim system prompt to fit budget
    const ratio = systemBudget / systemTokens;
    systemContent = systemContent.slice(0, Math.floor(systemContent.length * ratio));
    systemTokens = systemBudget;
    debug.budgetExceeded = true;
  }
  debug.systemTokens = systemTokens;

  // ── 2. Knowledge (memories) ──
  const deduped = mergeNearDuplicates(deduplicateSources(sources));
  debug.memoriesDropped = sources.length - deduped.length;

  // Sort by relevance
  deduped.sort((a, b) => b.relevance - a.relevance);

  // Build memory blocks, tracking token usage
  const memoryBlocks: string[] = [];
  let knowledgeTokens = 0;
  let memoriesUsed = 0;

  for (const s of deduped) {
    const block = formatMemoryBlock(s, memoriesUsed + 1);
    const blockTokens = estimateTokens(block);

    if (knowledgeTokens + blockTokens > knowledgeBudget) {
      debug.memoriesDropped++;
      continue;
    }

    memoryBlocks.push(block);
    knowledgeTokens += blockTokens;
    memoriesUsed++;
  }

  debug.knowledgeTokens = knowledgeTokens;
  debug.memoriesUsed = memoriesUsed;

  // ── 3. Conversation history ──
  let conversationTokens = 0;
  const conversationMessages: { role: string; content: string }[] = [];

  // Add from most recent to oldest, respecting budget
  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const m = conversationHistory[i];
    const msgTokens = estimateTokens(m.content);

    if (conversationTokens + msgTokens > conversationBudget) break;

    conversationMessages.unshift(m); // prepend to maintain order
    conversationTokens += msgTokens;
  }

  debug.conversationTokens = conversationTokens;

  // ── 4. Build final messages array ──
  const messages: { role: string; content: string }[] = [
    { role: "system", content: systemContent },
    ...conversationMessages,
  ];

  // Add memory context as a system-like message if any
  if (memoryBlocks.length > 0) {
    const memoryContext = buildMemoryContext(memoryBlocks, intent);
    messages.push({ role: "system", content: memoryContext });
  }

  debug.totalTokens = systemTokens + knowledgeTokens + conversationTokens;

  return { messages, debug };
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function formatMemoryBlock(s: RetrievalResult, index: number): string {
  const m = s.memory;

  // Determine the best content to show the LLM
  let content: string;
  if (m.type === "image" || m.type === "pdf") {
    // Prefer bestChunk (extracted text), then summary, then placeholder
    content = s.bestChunk || m.summary || `[${m.type}: ${m.title}]`;
  } else {
    content = m.content;
  }

  // Include summary and keywords for richer context
  const metaParts: string[] = [];
  if (m.summary) metaParts.push(`摘要: ${m.summary}`);
  if (m.keywords?.length) metaParts.push(`标签: ${m.keywords.join("、")}`);

  const header = `[记忆${index}] ${m.title} | ${m.type} | ${m.created_at?.slice(0, 10) || "?"}`;
  const meta = metaParts.length > 0 ? `\n${metaParts.join(" | ")}` : "";

  return `${header}${meta}\n${content}`;
}

function buildMemoryContext(blocks: string[], intent: string): string {
  const header =
    intent === "summarize"
      ? "以下是用户存储的相关内容，请帮用户进行总结和梳理："
      : intent === "analyze"
        ? "以下是用户存储的相关内容，请进行深度分析和洞察："
        : "以下是用户之前存储的相关内容，可以在回答中参考：";

  const footer =
    intent === "memory_search"
      ? "\n\n请基于以上内容回答用户的问题。如果某些内容不相关，可以忽略。"
      : intent === "summarize" || intent === "analyze"
        ? "\n\n请基于以上内容完成任务。"
        : "\n\n这些是用户的个人记忆。如果与当前问题相关，请自然地融入回答；如果不相关或不足以回答问题，请用你的通用知识补充。";

  return `${header}\n\n${blocks.join("\n\n")}${footer}`;
}
