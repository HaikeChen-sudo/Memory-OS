export type IntentType =
  | "greeting"
  | "memory_search"
  | "summarize"
  | "analyze"
  | "normal_chat";

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  /** Keywords extracted from the user query for memory matching */
  keywords: string[];
  /** Whether this intent typically benefits from memory retrieval */
  requiresMemories: boolean;
}
