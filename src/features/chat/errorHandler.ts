/**
 * Graceful degradation wrapper.
 *
 * Wraps any async operation with retry + fallback logic.
 * Ensures the user always gets a readable response.
 */

export interface DegradationConfig {
  maxRetries: number;
  fallbackMessage: string;
  context: string; // for logging
}

const DEFAULT_CONFIG: DegradationConfig = {
  maxRetries: 0,
  fallbackMessage: "⚠️ 系统降级模式：抱歉，当前操作无法完成，请稍后重试。",
  context: "unknown",
};

/**
 * Execute an operation with graceful degradation.
 *
 * On failure: retries up to maxRetries times, then returns fallback.
 * Logs all failures to console.
 */
export async function withGracefulDegradation<T>(
  operation: () => Promise<T>,
  fallback: T,
  context: string
): Promise<T> {
  const config: DegradationConfig = {
    ...DEFAULT_CONFIG,
    maxRetries: 1,
    context,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[Degradation] ${context} failed (attempt ${attempt + 1}/${config.maxRetries + 1}):`,
        lastError.message
      );

      if (attempt < config.maxRetries) {
        // Brief delay before retry
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  // All retries exhausted
  console.error(`[Degradation] ${context}: all attempts failed, using fallback`);
  return fallback;
}

/**
 * Pre-built degradation configs for common failure points.
 */
export const DegradationFallbacks = {
  llmCall: {
    maxRetries: 2,
    fallbackMessage: "抱歉，AI 服务暂时不可用，请稍后重试。",
    context: "LLM API call",
  },
  retrieval: {
    maxRetries: 0,
    fallbackMessage: "",
    context: "Memory retrieval",
  },
  jsonParse: {
    maxRetries: 1,
    fallbackMessage: "",
    context: "JSON parsing",
  },
  totalFailure: {
    maxRetries: 0,
    fallbackMessage:
      "抱歉，系统遇到问题，无法处理你的请求。请稍后重试或刷新页面。",
    context: "Total pipeline failure",
  },
} as const;
