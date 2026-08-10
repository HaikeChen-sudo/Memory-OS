import type { RetrievalResult } from "@/types";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export interface ReviewResult {
  passed: boolean;
  issues: string[];
  correctedAnswer?: string;
}

/* ------------------------------------------------------------------ */
/*  Fast keyword check (zero LLM cost)                                  */
/* ------------------------------------------------------------------ */

/**
 * Quick check: do key entities from sources appear in the answer?
 * This catches obvious fabrications without an extra LLM call.
 */
function fastCheck(
  answer: string,
  query: string
): ReviewResult {
  const issues: string[] = [];

  // Check: is the answer too short to be useful?
  if (answer.trim().length < 10) {
    issues.push("回答过短");
  }

  // Check: does the answer completely ignore the query?
  if (!answer.toLowerCase().includes(query.slice(0, 3).toLowerCase())) {
    // Only flag if query is specific enough (not bare greetings)
    if (query.length > 6) {
      issues.push("回答可能偏离问题主题");
    }
  }

  return {
    passed: issues.length === 0,
    issues,
  };
}

/* ------------------------------------------------------------------ */
/*  Deep review (LLM-based, for low-confidence responses)               */
/* ------------------------------------------------------------------ */

const REVIEWER_PROMPT = `你是一个严格的回答审核器。检查以下AI回答是否基于提供的记忆内容。

检查标准：
1. 回答是否引用了记忆中不存在的事实或数据？
2. 回答是否完整回应了用户的问题？
3. 回答是否偏离了问题主题？
4. 回答是否编造了记忆中找不到的具体细节？

严格按JSON格式返回（不要其他内容）：
{"passed": true或false, "issues": ["问题描述1", "问题描述2"], "correctedAnswer": "修正后的回答（仅当passed为false时填写，否则空字符串）"}`;

export async function deepReview(
  answer: string,
  sources: RetrievalResult[],
  query: string,
  callLLMFn: (prompt: string, temperature: number) => Promise<string>
): Promise<ReviewResult> {
  const memoryBlocks = sources
    .map(
      (s, i) =>
        `[记忆${i + 1}] 标题: ${s.memory.title}\n内容: ${s.memory.content}\n关键词: ${s.memory.keywords?.join(", ") || "无"}`
    )
    .join("\n\n");

  const prompt = `${REVIEWER_PROMPT}\n\n记忆内容：\n${memoryBlocks}\n\n用户问题：${query}\n\nAI回答：${answer}`;

  try {
    const response = await callLLMFn(prompt, 0.2);
    if (!response) {
      return { passed: true, issues: [] }; // Can't review, let it through
    }

    // Parse JSON
    let parsed: { passed?: boolean; issues?: string[]; correctedAnswer?: string } | null = null;

    try {
      parsed = JSON.parse(response.trim());
    } catch {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
      }
    }

    if (parsed && typeof parsed.passed === "boolean") {
      return {
        passed: parsed.passed,
        issues: parsed.issues || [],
        correctedAnswer: parsed.correctedAnswer || undefined,
      };
    }

    return { passed: true, issues: [] };
  } catch (error) {
    console.error("[Reviewer] Deep review failed:", error);
    return { passed: true, issues: [] }; // Let through on failure
  }
}

/* ------------------------------------------------------------------ */
/*  Main review entry point                                             */
/* ------------------------------------------------------------------ */

/**
 * Review an AI answer.
 * - Always runs a fast keyword check (zero cost)
 * - Runs deep LLM review only when confidence is low (< 0.5)
 */
export async function reviewAnswer(
  answer: string,
  sources: RetrievalResult[],
  query: string,
  confidence: number,
  callLLMFn: (prompt: string, temperature: number) => Promise<string>
): Promise<ReviewResult> {
  // Always do fast check
  const fast = fastCheck(answer, query);

  // For high-confidence responses, fast check is enough
  if (confidence >= 0.5 && fast.passed) {
    return fast;
  }

  // Low confidence or fast check failed → deep review
  const deep = await deepReview(answer, sources, query, callLLMFn);

  // Merge issues from both checks
  return {
    passed: deep.passed && fast.passed,
    issues: [...fast.issues, ...deep.issues],
    correctedAnswer: deep.correctedAnswer,
  };
}
