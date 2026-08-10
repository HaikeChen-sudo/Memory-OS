/**
 * Doubao Vision OCR service.
 *
 * Calls doubao-seed-1-6-vision-250815 (or DOUBAO_VISION_MODEL env var) to
 * extract text from images/PDF pages. Supports both model names and endpoint
 * IDs (ep-xxx).
 *
 * Prerequisites:
 *   DOUBAO_API_KEY env var must be set.
 *   DOUBAO_BASE_URL defaults to https://ark.cn-beijing.volces.com/api/v3
 *   DOUBAO_VISION_MODEL defaults to doubao-seed-1-6-vision-250815
 */

const DOUBAO_BASE_URL =
  process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const DOUBAO_VISION_MODEL =
  process.env.DOUBAO_VISION_MODEL || "doubao-seed-1-6-vision-250815";

/**
 * Prompt that instructs the vision model to extract text and remove noise.
 *
 * Rules:
 *  - Extract all visible text, no summarization or rewriting
 *  - Ignore watermarks, headers, footers, page numbers, logo text
 *  - Ignore ads, navigation bars, copyright notices
 *  - Preserve paragraph structure and line breaks
 *  - Keep natural formatting for mixed Chinese/English text
 *  - Recover tables and math formulas as plain text where possible
 *  - Return empty string if no text is found
 *  - Only return extracted text, no explanations
 */
const OCR_PROMPT = [
  "你是一个精确的文档文字提取器。请严格遵循以下规则：",
  "",
  "1. 提取图中所有可见的文字内容，不做任何总结、翻译或改写",
  "2. 忽略水印、页眉、页脚、页码、Logo 中的文字",
  "3. 忽略广告、导航栏、版权声明等非正文内容",
  "4. 保留原文的段落结构和换行",
  "5. 中英文混排时，中文保持连续不插入多余空格，英文单词保留前后空格",
  "6. 表格和数学公式用纯文本格式尽可能还原",
  "7. 如果图中没有任何文字，返回空字符串",
  "8. 只返回提取到的文字原文，不要添加任何解释、说明或额外内容",
].join("\n");

export interface DoubaoOCRResult {
  text: string;
}

/**
 * Call doubao-seed-1-6-vision-250815 to extract text from a base64 image.
 *
 * @param base64DataUrl - Full data URL: "data:image/png;base64,..."
 * @returns extracted and de-noised text, or null on failure
 */
export async function recognizeWithDoubao(
  base64DataUrl: string
): Promise<string | null> {
  const apiKey = process.env.DOUBAO_API_KEY;
  if (!apiKey) {
    console.error("[豆包 OCR] DOUBAO_API_KEY is not set");
    return null;
  }

  // Validate and extract MIME type from data URL
  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) {
    console.error("[豆包 OCR] Invalid data URL format");
    return null;
  }

  console.log(`[豆包 OCR] Calling ${DOUBAO_VISION_MODEL}...`);

  try {
    const response = await fetch(`${DOUBAO_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DOUBAO_VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: base64DataUrl,
                },
              },
              {
                type: "text",
                text: OCR_PROMPT,
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `[豆包 OCR] API error ${response.status}: ${errText.slice(0, 500)}`
      );
      return null;
    }

    const json = await response.json();
    const text: string = json.choices?.[0]?.message?.content || "";

    if (!text || !text.trim()) {
      console.log("[豆包 OCR] No text returned from model");
      return null;
    }

    const cleaned = text.trim();
    console.log(`[豆包 OCR] Done — ${cleaned.length} chars extracted`);
    return cleaned;
  } catch (err) {
    console.error(
      "[豆包 OCR] Request failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Recognize text from multiple base64 images (e.g. PDF pages).
 * Calls the vision model for each page and merges results.
 */
export async function recognizePagesWithDoubao(
  base64Pages: string[]
): Promise<string | null> {
  const results: string[] = [];

  for (let i = 0; i < base64Pages.length; i++) {
    console.log(`[豆包 OCR] Page ${i + 1}/${base64Pages.length}...`);
    const text = await recognizeWithDoubao(base64Pages[i]);
    if (text) {
      results.push(text);
    }
  }

  if (results.length === 0) {
    console.log("[豆包 OCR] No text found across all pages");
    return null;
  }

  const merged = results.join("\n\n");
  console.log(
    `[豆包 OCR] All pages done — ${merged.length} chars total (${results.length}/${base64Pages.length} pages had text)`
  );
  return merged;
}

/* ────────────────────────────────────────
   Video Frame Analysis — 豆包 Seed 2.0 Lite
   ──────────────────────────────────────── */

const DOUBAO_LITE_MODEL =
  process.env.DOUBAO_LITE_MODEL || "doubao-seed-2-0-lite";

const DOUBAO_LITE_BASE_URL =
  process.env.DOUBAO_LITE_BASE_URL ||
  process.env.DOUBAO_BASE_URL ||
  "https://ark.cn-beijing.volces.com/api/v3";

const VIDEO_FRAME_PROMPT = [
  "你是一个视频内容提取器。你的唯一任务是提取这个画面中与视频主题相关的核心内容：",
  "",
  "1. 文字内容：完整提取画面中幻灯片、黑板、字幕上的所有文字",
  "2. 知识点：识别并列出画面中讲解的概念、公式、定理、关键词",
  "3. 数据/图表：如果画面中有图表、表格、流程图，描述其含义",
  "",
  "重要规则：",
  "- 忽略人物的外貌、衣着、动作、表情、环境等无关视觉细节",
  "- 忽略背景、光线、场景氛围等无关信息",
  "- 如果画面中没有任何文字内容或知识点，返回「无实质内容」",
  "- 只返回提取到的内容，不要加任何前缀或解释",
  "- 控制在150字以内",
].join("\n");

/**
 * Describe a single video frame using 豆包 Seed 2.0 Lite vision model.
 *
 * Uses DOUBAO_LITE_API_KEY (falls back to DOUBAO_API_KEY).
 * Uses DOUBAO_LITE_MODEL (defaults to doubao-seed-2-0-lite).
 * Supports both model names and endpoint IDs (ep-xxx).
 *
 * @param base64DataUrl - Full data URL: "data:image/jpeg;base64,..."
 * @returns frame description text, or null on failure
 */
export async function describeVideoFrame(
  base64DataUrl: string
): Promise<string | null> {
  const apiKey =
    process.env.DOUBAO_LITE_API_KEY || process.env.DOUBAO_API_KEY;
  if (!apiKey) {
    console.error("[豆包 Lite] DOUBAO_LITE_API_KEY is not set");
    return null;
  }

  try {
    const response = await fetch(`${DOUBAO_LITE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DOUBAO_LITE_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: base64DataUrl },
              },
              {
                type: "text",
                text: VIDEO_FRAME_PROMPT,
              },
            ],
          },
        ],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(
        `[豆包 Lite] API error ${response.status}: ${errText.slice(0, 500)}`
      );
      return null;
    }

    const json = await response.json();
    const text: string = json.choices?.[0]?.message?.content || "";

    if (!text || !text.trim()) {
      return null;
    }

    return text.trim();
  } catch (err) {
    console.error(
      "[豆包 Lite] Request failed:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
