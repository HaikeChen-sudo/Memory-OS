/**
 * Split text into overlapping chunks for better retrieval.
 *
 * Default: 1000 chars per chunk, 200 char overlap.
 * Split on sentence boundaries (。！？\n) when possible.
 */

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 200;

export function chunkText(
  text: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
  overlap = DEFAULT_OVERLAP
): string[] {
  if (!text || text.length <= chunkSize) {
    return text ? [text] : [];
  }

  const sentences = text.split(/(?<=[。！？\n])/g);
  const chunks: string[] = [];
  let current = "";
  let overlapBuffer = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // Start overlap from the end of the previous chunk
      const startIdx = Math.max(0, current.length - overlap);
      overlapBuffer = current.slice(startIdx);
      current = overlapBuffer + sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.length > 0 ? chunks : [text];
}
