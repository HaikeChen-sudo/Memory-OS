/**
 * LLM proxy endpoint.
 *
 * The browser calls this endpoint to reach the AI provider.
 * API key stays on the server — never exposed to the client.
 *
 * Provider auto-detection: DeepSeek → OpenAI → Anthropic
 */

import { NextRequest, NextResponse } from "next/server";
import { getAIConfig } from "@/lib/ai-config";

export async function POST(request: NextRequest) {
  try {
    const { prompt, messages: inputMessages, temperature, max_tokens } = await request.json();
    if (!prompt && !inputMessages) {
      return NextResponse.json({ error: "prompt or messages is required" }, { status: 400 });
    }

    const config = getAIConfig();

    if (config.provider === "none") {
      return NextResponse.json({ text: "", fallback: true }, { status: 200 });
    }

    // Use provided messages array directly, or parse from prompt string
    const messages = inputMessages || parsePrompt(prompt);
    const effectiveTemp = typeof temperature === "number" ? temperature : 0.7;
    const effectiveMaxTokens = typeof max_tokens === "number" ? max_tokens : 2048;
    const url = `${config.baseURL}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.chatModel,
        messages,
        max_tokens: effectiveMaxTokens,
        temperature: effectiveTemp,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[${config.provider}] API error:`, response.status, errText);
      return NextResponse.json(
        { error: `${config.provider} error: ${response.status}` },
        { status: 502 }
      );
    }

    const json = await response.json();
    const text = json.choices?.[0]?.message?.content || "";

    return NextResponse.json({ text, fallback: false });
  } catch (error) {
    console.error("LLM proxy error:", error);
    return NextResponse.json(
      { error: "Failed to call LLM" },
      { status: 500 }
    );
  }
}

function parsePrompt(prompt: string): { role: string; content: string }[] {
  const parts = prompt.split("\n\nUser:");
  const systemContent = parts[0];
  const userContent = parts[1]?.replace("\nAssistant:", "") || "";

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
}
