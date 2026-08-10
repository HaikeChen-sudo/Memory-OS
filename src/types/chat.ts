export interface Chat {
  id: string;
  folder_id: string;
  title: string;
  color: string;
  animation_state: string;
  created_at: string;
  updated_at: string;
}

/** Alias — Chat and Session are the same entity */
export type Session = Chat;

export type MessageRole = "user" | "assistant" | "system";

export interface Citation {
  memory_id: string;
  source_id: string | null;
  text_snippet: string;
  strength: number;
  position_in_message: { start: number; end: number } | null;
}

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  citations: Citation[];
  animation_state: string;
  created_at: string;
}

export interface ChatCreateInput {
  title?: string;
}

export interface MessageSendInput {
  content: string;
}

/* ── AI Pipeline Types ── */

export interface RetrievalResult {
  memory: import("./memory").Memory;
  relevance: number;
  matchedSnippet: string;
  /** Best matching chunk text — used for prompt building instead of full extracted_text */
  bestChunk?: string;
}

export interface AnswerResult {
  answer: string;
  sources: RetrievalResult[];
  confidence: number;
  sourceCount: number;
  sourceTime: string;
  /** Detected user intent */
  intent?: import("./intent").IntentType;
  /** Whether any user memories were used in the answer */
  memoriesUsed: boolean;
}

/* ── Debug / Observability ── */

export interface DebugLog {
  id: string;
  query: string;
  intent: string;
  retrievedCount: number;
  retrievedMemoryIds: string[];
  systemTokens: number;
  conversationTokens: number;
  knowledgeTokens: number;
  promptTokens: number;
  responseTokens: number;
  retrievalMs: number;
  llmMs: number;
  totalMs: number;
  usedFallback: boolean;
  reviewerPassed: boolean | null;
  retryCount: number;
  timestamp: string;
}
