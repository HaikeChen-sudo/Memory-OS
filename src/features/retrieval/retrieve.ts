import { storage } from "@/storage";
import type { Memory, RetrievalResult } from "@/types";

/**
 * retrieve() — keyword-based semantic search over user memories.
 *
 * Three-layer matching:
 * 1. Exact keyword match (Jaccard intersection)
 * 2. Fuzzy keyword match (substring / partial match)
 * 3. Content substring match (fallback for non-enriched memories)
 *
 * Future: embedding → vector search for even better semantic matching.
 */

export interface RetrieveOptions {
  maxResults?: number;
  minRelevance?: number;
  type?: Memory["type"];
}

/* ------------------------------------------------------------------ */
/*  Fuzzy matching helpers                                              */
/* ------------------------------------------------------------------ */

/**
 * Check if a query keyword fuzzy-matches a memory keyword.
 * Handles: substring match ("React" in "React Native"), prefix match,
 * and Chinese character overlap.
 */
function fuzzyMatch(queryKw: string, memoryKw: string): number {
  const q = queryKw.toLowerCase();
  const m = memoryKw.toLowerCase();

  // Exact match
  if (q === m) return 1.0;

  // Full substring: query is contained in memory keyword or vice versa
  if (m.includes(q)) return 0.7;
  if (q.includes(m)) return 0.6;

  // Word-level: if either is multi-word, check word overlap
  const qWords = q.split(/[\s/-]+/);
  const mWords = m.split(/[\s/-]+/);
  let wordOverlap = 0;
  for (const qw of qWords) {
    if (qw.length < 2) continue;
    for (const mw of mWords) {
      if (mw.length < 2) continue;
      if (mw === qw) { wordOverlap++; break; }
      if (mw.includes(qw) || qw.includes(mw)) { wordOverlap += 0.5; break; }
    }
  }
  if (wordOverlap > 0) {
    return Math.min(0.5, wordOverlap / Math.max(qWords.length, mWords.length));
  }

  // Chinese character overlap (for compound terms like 前端开发 vs 前端)
  if (/[一-鿿]/.test(q) && /[一-鿿]/.test(m)) {
    const qChars = new Set([...q]);
    const mChars = new Set([...m]);
    const overlap = [...qChars].filter((c) => mChars.has(c)).length;
    if (overlap >= 2) {
      return 0.3 * (overlap / Math.max(qChars.size, mChars.size));
    }
  }

  return 0;
}

/**
 * Calculate combined relevance score for a memory against query keywords.
 */
function scoreMemory(
  queryKeywords: string[],
  memoryKeywords: string[]
): { relevance: number; matchedKeywords: string[]; matchDetails: string[] } {
  const totalScore = queryKeywords.length;
  let accumulatedScore = 0;
  const matchedKeywords: string[] = [];
  const matchDetails: string[] = [];

  for (const qk of queryKeywords) {
    let bestMatchScore = 0;
    let bestMatchKw = "";

    for (const mk of memoryKeywords) {
      const score = fuzzyMatch(qk, mk);
      if (score > bestMatchScore) {
        bestMatchScore = score;
        bestMatchKw = mk;
      }
    }

    if (bestMatchScore > 0) {
      accumulatedScore += bestMatchScore;
      matchedKeywords.push(qk);
      if (bestMatchScore < 1.0) {
        matchDetails.push(`${qk}≈${bestMatchKw}`);
      }
    }
  }

  // Normalize: how well does this memory cover the query?
  const relevance = totalScore > 0 ? accumulatedScore / totalScore : 0;
  return { relevance, matchedKeywords, matchDetails };
}

/* ------------------------------------------------------------------ */
/*  Main retrieval                                                      */
/* ------------------------------------------------------------------ */

/**
 * Main retrieval: keyword-based matching with fuzzy support.
 *
 * @param queryKeywords - Keywords extracted from user query (by intent recognizer)
 * @param memories - All available memories to search
 * @param options - maxResults, minRelevance, type filter
 */
export async function retrieve(
  queryKeywords: string[],
  memories: Memory[],
  options: RetrieveOptions = {}
): Promise<RetrievalResult[]> {
  const { maxResults = 20, minRelevance = 0.0, type } = options;

  if (!queryKeywords.length) {
    return [];
  }

  // Split memories into enriched (has keywords) and raw (no keywords yet)
  const enriched: Memory[] = [];
  const raw: Memory[] = [];

  for (const m of memories) {
    if (type && m.type !== type) continue;
    if (m.keywords && m.keywords.length > 0) {
      enriched.push(m);
    } else {
      raw.push(m);
    }
  }

  // Phase 1: Keyword-based matching with fuzzy support (enriched memories)
  const results: RetrievalResult[] = [];

  for (const memory of enriched) {
    const { relevance, matchedKeywords, matchDetails } = scoreMemory(
      queryKeywords,
      memory.keywords!
    );

    if (relevance < minRelevance) continue;

    // Try to load best chunk from file content for images/PDFs
    let bestChunk: string | undefined;
    const fileId = memory.metadata?.file_id as string | undefined;
    if (fileId) {
      try {
        const fileContent = await storage.readFileContent(fileId);
        if (fileContent?.chunks?.length) {
          let bestScore = 0;
          for (const chunk of fileContent.chunks) {
            const chunkLower = chunk.toLowerCase();
            let score = 0;
            for (const kw of matchedKeywords) {
              if (chunkLower.includes(kw.toLowerCase())) score += 1;
            }
            if (score > bestScore) {
              bestScore = score;
              bestChunk = chunk;
            }
          }
          // Fallback: if no chunk matched keywords, use first chunks as context
          if (!bestChunk) {
            bestChunk = fileContent.chunks.slice(0, 3).join("\n");
          }
        } else if (fileContent?.extracted_text) {
          bestChunk = fileContent.extracted_text.slice(0, 2000);
        }
      } catch {
        // File content not available — skip
      }
    }

    // Boost relevance for recent memories (slight time decay bonus)
    const ageMs = Date.now() - new Date(memory.created_at).getTime();
    const recencyBoost = Math.max(0, 0.05 * (1 - ageMs / (30 * 24 * 3600 * 1000))); // decays over 30 days

    const snippetParts: string[] = [];
    if (matchedKeywords.length > 0) {
      snippetParts.push(`匹配: ${matchedKeywords.join(", ")}`);
    }
    if (matchDetails.length > 0) {
      snippetParts.push(`模糊匹配: ${matchDetails.join("; ")}`);
    }

    results.push({
      memory,
      relevance: Math.round(Math.min(1, relevance + recencyBoost) * 100) / 100,
      matchedSnippet: snippetParts.join(" | ") || `相关: ${memory.title}`,
      bestChunk,
    });
  }

  // Phase 2: Content-based fallback for non-enriched or low-result scenarios
  // retrieveByContent now automatically loads extracted_text for image/PDF memories
  if (raw.length > 0 && results.length < maxResults) {
    const remaining = maxResults - results.length;

    const contentResults = await retrieveByContent(
      queryKeywords.join(" "),
      raw,
      { maxResults: remaining, minRelevance, type }
    );

    // Merge, dedup by memory.id
    const seen = new Set(results.map((r) => r.memory.id));
    for (const cr of contentResults) {
      if (!seen.has(cr.memory.id)) {
        results.push(cr);
        seen.add(cr.memory.id);
      }
    }
  }

  // Sort by relevance descending
  results.sort((a, b) => b.relevance - a.relevance);

  return results.slice(0, maxResults);
}

/**
 * Input to retrieveByContent — either a Memory or a memory with pre-loaded text.
 */
type MemoryWithText = Memory & { _searchText?: string };

/**
 * Fallback: substring matching against title + content.
 * Used for memories that haven't been enriched with keywords yet.
 * For image/PDF memories, loads extracted_text from file_contents automatically.
 */
export async function retrieveByContent(
  query: string,
  memories: Memory[],
  options: RetrieveOptions = {}
): Promise<RetrievalResult[]> {
  const { maxResults = 10, minRelevance = 0.1, type } = options;

  const q = query.toLowerCase();
  const queryWords = q.split(/\s+/).filter((w) => w.length > 0);
  const results: RetrievalResult[] = [];

  for (const memory of memories) {
    if (type && memory.type !== type) continue;

    // For image/PDF, use extracted_text instead of base64 content
    let searchContent = memory.content;
    const mwt = memory as MemoryWithText;
    if (mwt._searchText) {
      searchContent = mwt._searchText;
    } else if (memory.type === "image" || memory.type === "pdf") {
      const fileId = memory.metadata?.file_id as string | undefined;
      if (fileId) {
        try {
          const fc = await storage.readFileContent(fileId);
          if (fc?.extracted_text) {
            searchContent = fc.extracted_text;
          }
        } catch { /* keep original content */ }
      }
    }

    let relevance = 0;
    let matchedSnippet = "";

    // Title match
    const titleLower = memory.title.toLowerCase();
    if (titleLower.includes(q)) {
      relevance += 0.5;
      matchedSnippet = `标题: ${memory.title}`;
    }
    for (const word of queryWords) {
      if (word.length >= 2 && titleLower.includes(word)) {
        relevance += 0.15;
      }
    }

    // Content match (against searchContent, not raw base64)
    const contentLower = searchContent.toLowerCase();
    if (contentLower.includes(q)) {
      relevance += 0.3;
      if (!matchedSnippet) {
        const idx = contentLower.indexOf(q);
        const start = Math.max(0, idx - 30);
        const end = Math.min(contentLower.length, idx + q.length + 30);
        matchedSnippet = searchContent.slice(start, end);
      }
    }
    for (const word of queryWords) {
      if (word.length >= 2 && contentLower.includes(word)) {
        relevance += 0.1;
      }
    }

    // File content chunk matching
    let bestChunk: string | undefined;
    const fileId = memory.metadata?.file_id as string | undefined;
    if (fileId) {
      try {
        const fileContent = await storage.readFileContent(fileId);
        if (fileContent?.chunks?.length) {
          let bestChunkScore = 0;
          for (const chunk of fileContent.chunks) {
            const lower = chunk.toLowerCase();
            let cScore = 0;
            if (lower.includes(q)) cScore += 0.35;
            for (const word of queryWords) {
              if (word.length >= 2 && lower.includes(word)) cScore += 0.08;
            }
            if (cScore > bestChunkScore) {
              bestChunkScore = cScore;
              bestChunk = chunk;
            }
          }
          relevance += Math.min(bestChunkScore, 1);
        } else if (fileContent?.extracted_text) {
          const extracted = fileContent.extracted_text.toLowerCase();
          if (extracted.includes(q)) relevance += 0.35;
          for (const word of queryWords) {
            if (word.length >= 2 && extracted.includes(word)) relevance += 0.08;
          }
          relevance = Math.min(relevance, 1);
          bestChunk = fileContent.extracted_text;
        }
      } catch {
        // File content not available
      }
    }

    relevance = Math.min(1, relevance);

    if (relevance >= minRelevance) {
      results.push({
        memory,
        relevance: Math.round(relevance * 100) / 100,
        matchedSnippet: matchedSnippet || memory.title,
        bestChunk,
      });
    }
  }

  results.sort((a, b) => b.relevance - a.relevance);
  return results.slice(0, maxResults);
}
