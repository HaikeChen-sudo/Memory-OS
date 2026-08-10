/**
 * AI Provider configuration — provider auto-detection + fallback chain.
 *
 * Priority: DeepSeek → OpenAI → Anthropic
 *
 * DeepSeek API is OpenAI-compatible, so we reuse the same fetch pattern
 * and only change baseURL + model name.
 */

type AIProvider = "deepseek" | "openai" | "anthropic" | "none";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseURL: string;
  chatModel: string;
  reasonerModel: string;
  embeddingModel: string;
  hasEmbedding: boolean;
}

export interface VisionConfig {
  provider: "doubao" | "openai" | "anthropic" | "none";
  apiKey: string;
  baseURL: string;
  model: string;
}

export function getAIConfig(): AIConfig {
  // 1. DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      provider: "deepseek",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
      chatModel: process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat",
      reasonerModel: process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner",
      embeddingModel: "text-embedding-3-small",
      hasEmbedding: false,
    };
  }

  // 2. OpenAI
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      chatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      reasonerModel: "o3-mini",
      embeddingModel: "text-embedding-3-small",
      hasEmbedding: true,
    };
  }

  // 3. Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: "https://api.anthropic.com/v1",
      chatModel: "claude-sonnet-4-6",
      reasonerModel: "claude-opus-4-7",
      embeddingModel: "",
      hasEmbedding: false,
    };
  }

  // 4. None configured
  return {
    provider: "none",
    apiKey: "",
    baseURL: "",
    chatModel: "",
    reasonerModel: "",
    embeddingModel: "",
    hasEmbedding: false,
  };
}

/**
 * Get vision/OCR model config.
 * Priority: Doubao (doubao-seed-1-6-vision-250815) → OpenAI (GPT-4o) → Anthropic (Claude)
 */
export function getVisionConfig(): VisionConfig {
  // 1. Doubao Vision — dedicated OCR model (supports ep-xxx endpoint IDs)
  if (process.env.DOUBAO_API_KEY) {
    return {
      provider: "doubao",
      apiKey: process.env.DOUBAO_API_KEY,
      baseURL: process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
      model: process.env.DOUBAO_VISION_MODEL || "doubao-seed-1-6-vision-250815",
    };
  }

  // 2. OpenAI Vision
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
    };
  }

  // 3. Anthropic Vision
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-6",
    };
  }

  return {
    provider: "none",
    apiKey: "",
    baseURL: "",
    model: "",
  };
}
