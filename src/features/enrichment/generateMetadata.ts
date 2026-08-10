import { storage } from "@/storage";
import { getAIConfig } from "@/lib/ai-config";

const KEYWORD_PROMPT = `你是一个深度内容理解引擎。根据以下从文件提取的文字，完成以下任务：

1. 生成 10-30 个中文关键词，覆盖以下维度：
   - 主题/话题 (topic)
   - 情感/情绪 (emotion/sentiment) — 如 "温暖"、"焦虑"、"激励"
   - 领域/学科 (domain) — 如 "前端开发"、"心理学"、"经济学"
   - 人物/角色 (people) — 如 "产品经理"、"创业者"
   - 场景/地点 (scene) — 如 "职场"、"家庭"、"线上会议"
   - 抽象概念 (abstract concepts) — 如 "自由"、"成长"、"意义"
   - 上位概念/类别 (upper-level categories) — 如 "技术"、"哲学"、"设计"
   - 情感标签 (sentiment tags) — positive/negative/neutral/urgent/important

2. 生成一个约100字的中文摘要，概括核心内容，让人能快速理解主旨。

3. 提取 1-3 个主题标签 (topics)，如 "机器学习", "产品设计"

4. 提取文中出现的实体 (entities)，包括人物名、组织名、产品名、地名等

关键词要求：
- 数量 10~30 个
- 包含具体词和抽象词
- 包含上位概念和下位概念
- 不仅抽取名词，还要包含情感和概念性词汇
- 质量优先于数量

示例输入：
"人生的意义或许并不是成功，而是在有限时间里找到真正热爱的事情。"

示例输出关键词：
["人生", "成长", "哲学", "人生意义", "热爱", "价值观", "自我探索", "思考", "幸福", "生命", "时间", "励志"]

示例输入：
"React Server Component 的工作原理"

示例输出关键词：
["React", "前端开发", "Next.js", "Server Component", "Web开发", "技术文档", "编程", "JavaScript", "服务端渲染", "SSR", "架构设计"]

严格按以下JSON格式返回，不要包含任何其他内容（不要markdown代码块标记）：
{"keywords": ["关键词1", ...], "summary": "约100字的中文摘要...", "topics": ["主题1"], "entities": ["实体1", "实体2"]}`;

interface EnrichmentOutput {
  keywords: string[];
  summary: string;
  topics?: string[];
  entities?: string[];
}

/**
 * After OCR extracts text, generate AI keywords and summary.
 * Called fire-and-forget from parseFile / analyzeVideo.
 * Dispatches "memory-enriched" custom event so UI can refresh.
 */
export async function generateMemoryMetadata(
  memoryId: string,
  extractedText: string
): Promise<void> {
  try {
    const config = getAIConfig();
    if (config.provider === "none") {
      console.warn("[enrichment] No AI provider configured, skipping metadata generation");
      return;
    }

    const prompt = `${KEYWORD_PROMPT}\n\n以下是文件提取的文字内容：\n\n${extractedText}`;

    // Use the client-side LLM proxy to protect API keys
    const response = await fetch("/api/chat/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, temperature: 0.3, max_tokens: 1024 }),
    });

    if (!response.ok) {
      console.error("[enrichment] LLM request failed:", response.status);
      return;
    }

    const json = await response.json();
    if (json.fallback || json.error) {
      console.warn("[enrichment] LLM fallback/error:", json.error || "no API key");
      return;
    }

    const rawText = json.text?.trim();
    if (!rawText) {
      console.warn("[enrichment] Empty LLM response");
      return;
    }

    // Parse the JSON response — try to extract JSON even if wrapped in markdown
    const parsed = parseEnrichmentResponse(rawText);
    if (!parsed) {
      console.warn("[enrichment] Failed to parse LLM JSON response:", rawText.slice(0, 200));
      return;
    }

    // Read current memory, update fields, save
    const memory = await storage.readMemory(memoryId);
    if (!memory) {
      console.warn("[enrichment] Memory not found:", memoryId);
      return;
    }

    memory.keywords = parsed.keywords.slice(0, 30); // cap at 30
    memory.summary = parsed.summary.slice(0, 200);  // cap at 200 chars

    // ★ Ensure content is text (not base64 or placeholder)
    // For image/PDF memories, extractedText was passed from parseFile
    // This is a safety net in case parseFile didn't update memory.content yet
    if (memory.type === "image" || memory.type === "pdf") {
      memory.content = extractedText.slice(0, 10000);
    }

    // Store topics and entities in metadata for retrieval
    if (parsed.topics?.length || parsed.entities?.length) {
      memory.metadata = {
        ...memory.metadata,
        topics: parsed.topics || [],
        entities: parsed.entities || [],
      };
    }

    await storage.saveMemory(memory);

    // Notify UI to refresh
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("memory-enriched", { detail: { memoryId } })
      );
    }

    console.log(
      `[enrichment] Memory ${memoryId} enriched: ${parsed.keywords.length} keywords, summary ${parsed.summary.length} chars`
    );
  } catch (error) {
    console.error("[enrichment] Unexpected error:", error);
    // Never throw — this is fire-and-forget
  }
}

/**
 * Parse the LLM response into { keywords, summary }.
 * Handles responses that may be wrapped in markdown code blocks.
 */
function parseEnrichmentResponse(text: string): EnrichmentOutput | null {
  // Try direct JSON parse first
  try {
    const parsed = JSON.parse(text);
    if (isValidOutput(parsed)) return parsed;
  } catch {
    // fall through to extraction attempts
  }

  // Try extracting JSON from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (isValidOutput(parsed)) return parsed;
    } catch {
      // fall through
    }
  }

  // Try extracting JSON object from anywhere in the text
  const jsonMatch = text.match(/\{[\s\S]*"keywords"[\s\S]*"summary"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (isValidOutput(parsed)) return parsed;
    } catch {
      // give up
    }
  }

  return null;
}

function isValidOutput(obj: unknown): obj is EnrichmentOutput {
  return (
    obj !== null &&
    typeof obj === "object" &&
    Array.isArray((obj as Record<string, unknown>).keywords) &&
    typeof (obj as Record<string, unknown>).summary === "string"
  );
}
