/**
 * OCR endpoint — doubao-seed-1-6-vision-250815 as primary, OpenAI/Anthropic as fallback.
 *
 * The browser sends a base64 image. The server calls the configured vision
 * model to extract text with de-noising built into the prompt.
 *
 * Falls back through providers: doubao → openai → anthropic → none
 */

import { NextRequest, NextResponse } from "next/server";
import { getVisionConfig, type VisionConfig } from "@/lib/ai-config";
import { recognizeWithDoubao } from "@/services/parser/doubao-ocr";

export async function POST(request: NextRequest) {
  try {
    const { image } = await request.json();
    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "image (base64 data URL) is required" },
        { status: 400 }
      );
    }

    // Validate data URL format
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return NextResponse.json(
        { error: "Invalid image format. Expected data URL." },
        { status: 400 }
      );
    }

    const mimeType = match[1];
    const base64Data = match[2];

    const config = getVisionConfig();

    if (config.provider === "none") {
      return NextResponse.json(
        { text: "", fallback: true, error: "No vision provider configured" },
        { status: 200 }
      );
    }

    let text: string | null = null;

    if (config.provider === "doubao") {
      text = await recognizeWithDoubao(image);
    } else if (config.provider === "openai") {
      text = await callOpenAIVision(config, mimeType, base64Data);
    } else if (config.provider === "anthropic") {
      text = await callAnthropicVision(config, mimeType, base64Data);
    }

    if (text === null) {
      return NextResponse.json(
        { text: "", fallback: true, error: "OCR returned no text" },
        { status: 200 }
      );
    }

    return NextResponse.json({ text, fallback: false });
  } catch (error) {
    console.error("OCR error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OCR failed" },
      { status: 500 }
    );
  }
}

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

async function callOpenAIVision(
  config: VisionConfig,
  mimeType: string,
  base64Data: string
): Promise<string | null> {
  try {
    const response = await fetch(`${config.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64Data}` },
              },
              { type: "text", text: OCR_PROMPT },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0,
      }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

async function callAnthropicVision(
  config: VisionConfig,
  mimeType: string,
  base64Data: string
): Promise<string | null> {
  try {
    const response = await fetch(`${config.baseURL}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mimeType,
                  data: base64Data,
                },
              },
              { type: "text", text: OCR_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const json = await response.json();
    return json.content?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}
