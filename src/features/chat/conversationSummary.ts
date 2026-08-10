/**
 * Conversation Summary — compresses long conversation history into
 * a structured summary to preserve context without token bloat.
 *
 * Triggered when conversation exceeds 20 turns.
 */

const SUMMARY_TRIGGER_TURNS = 10; // trigger earlier for better context preservation
const SUMMARY_COMPRESS_TURNS = 6; // compress the oldest 6 turns

const SUMMARY_PROMPT = `请根据以下对话内容生成简洁的摘要，用于帮助AI在后续对话中保持上下文连贯。

摘要应包含：
- 用户当前在讨论什么话题
- 用户提到了哪些重要信息或偏好
- AI已经帮助用户完成了什么
- 有什么待跟进的事项
- 用户的情绪状态（如可观察）

格式要求：用2-4句中文自然描述，不要分点罗列，不要用标签格式。

对话内容：`;

export interface ConversationSummary {
  /** When the summary was generated */
  generatedAt: string;
  /** The structured summary text */
  text: string;
  /** Number of turns covered by this summary */
  coveredTurns: number;
}

/**
 * Check if a summary should be generated based on conversation length.
 */
export function shouldGenerateSummary(turnCount: number): boolean {
  return turnCount >= SUMMARY_TRIGGER_TURNS;
}

/**
 * Generate a conversation summary via LLM.
 * Call this on the oldest turns that will be compressed out.
 */
export async function generateSummary(
  messages: { role: "user" | "assistant"; content: string }[],
  callLLMFn: (prompt: string, temperature: number) => Promise<string>
): Promise<ConversationSummary | null> {
  if (messages.length < SUMMARY_COMPRESS_TURNS) return null;

  const oldestTurns = messages.slice(0, SUMMARY_COMPRESS_TURNS);
  const dialogText = oldestTurns
    .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`)
    .join("\n");

  const prompt = `${SUMMARY_PROMPT}\n\n${dialogText}`;

  try {
    const response = await callLLMFn(prompt, 0.2);
    if (!response || response.trim().length < 10) return null;

    return {
      generatedAt: new Date().toISOString(),
      text: response.trim(),
      coveredTurns: SUMMARY_COMPRESS_TURNS,
    };
  } catch (error) {
    console.error("[ConversationSummary] Failed to generate:", error);
    return null;
  }
}

/**
 * Build the final conversation context by combining:
 * - Summary of old turns (if any)
 * - Recent raw messages (last 10 turns)
 */
export function buildConversationContext(
  history: { role: "user" | "assistant"; content: string }[],
  summary: ConversationSummary | null
): { role: "system" | "user" | "assistant"; content: string }[] {
  const result: { role: "system" | "user" | "assistant"; content: string }[] = [];

  // Inject summary as system message if available
  if (summary) {
    result.push({
      role: "system",
      content: `[对话历史摘要]\n${summary.text}\n[/对话历史摘要]`,
    });
  }

  // Add recent raw messages (last 10 turns = 20 messages)
  const recentMessages = history.slice(-20);

  for (const m of recentMessages) {
    result.push({ role: m.role, content: m.content });
  }

  return result;
}
