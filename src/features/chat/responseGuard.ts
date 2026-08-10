import type { RetrievalResult } from "@/types";

const GUARD_MIN_LENGTH = 5;
const MAX_RETRIES = 2;

const FALLBACK_MESSAGE =
  "抱歉，我暂时无法回答这个问题。请稍后重试或换个问法。";

/**
 * Guarded LLM call — detects empty/short responses and retries.
 *
 * On empty response: re-inject context + explicit instruction, retry up to 2 times.
 * On all failures: return a friendly fallback message.
 */
export async function guardedCallLLM(
  callFn: (prompt: string, temperature: number) => Promise<string>,
  prompt: string,
  temperature: number,
  context?: {
    query: string;
    sources: RetrievalResult[];
  }
): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await callFn(prompt, temperature);

      // Check for empty or too-short response
      if (!response || response.trim().length < GUARD_MIN_LENGTH) {
        console.warn(
          `[ResponseGuard] Empty/short response (attempt ${attempt + 1}/${MAX_RETRIES + 1})`
        );

        if (attempt < MAX_RETRIES) {
          // Retry with stronger instruction
          prompt = buildRetryPrompt(prompt, context);
          continue;
        }

        // All retries exhausted
        console.error("[ResponseGuard] All retries exhausted, using fallback");
        return FALLBACK_MESSAGE;
      }

      // Valid response
      return response;
    } catch (error) {
      console.error(
        `[ResponseGuard] LLM error (attempt ${attempt + 1}):`,
        error
      );

      if (attempt < MAX_RETRIES) continue;
      return FALLBACK_MESSAGE;
    }
  }

  return FALLBACK_MESSAGE;
}

/**
 * Build a retry prompt with explicit output requirements.
 */
function buildRetryPrompt(
  originalPrompt: string,
  context?: { query: string; sources: RetrievalResult[] }
): string {
  // If we have context, rebuild with stronger instruction
  if (context) {
    const memoryNote =
      context.sources.length > 0
        ? `\n记忆内容已提供 (${context.sources.length} 条)。`
        : "\n没有相关记忆，请用通用知识回答。";

    return `${originalPrompt}\n\n【重要】请基于以上信息，针对用户问题"${context.query}"给出回答。${memoryNote}必须输出至少一句完整、有意义的中文回复。不要只输出空白或单个词。`;
  }

  // Simple append for prompt-only calls
  return `${originalPrompt}\n\n【重要】请必须输出完整的中文回复，禁止输出空白内容。`;
}
