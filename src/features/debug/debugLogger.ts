/**
 * Debug logger — records per-request observability data.
 */

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

const MAX_LOGS = 20;
let logs: DebugLog[] = [];
let listeners: Array<(logs: DebugLog[]) => void> = [];

export function getDebugLogs(): DebugLog[] {
  return logs;
}

export function addDebugLog(log: DebugLog): void {
  logs = [log, ...logs].slice(0, MAX_LOGS);
  listeners.forEach((fn) => fn(logs));
}

export function clearDebugLogs(): void {
  logs = [];
  listeners.forEach((fn) => fn(logs));
}

export function subscribeToDebugLogs(fn: (logs: DebugLog[]) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

/**
 * Create a timer for measuring operation duration.
 */
export function createTimer(): { start: number; elapsed: () => number } {
  const start = performance.now();
  return {
    start,
    elapsed: () => Math.round(performance.now() - start),
  };
}
