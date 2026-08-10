"use client";

import { useMemoryStore } from "@/stores/memoryStore";
import { MemoryDetail } from "./MemoryDetail";
import { ProjectBrief } from "./ProjectBrief";

/**
 * Middle panel — Relationship Canvas (future) / Memory Detail (current).
 *
 * MVP behavior:
 * - No memory selected → show placeholder
 * - Memory selected → show detail view with full content + delete
 *
 * Future: RelationshipCanvas replaces placeholder when data is ready.
 */
export function MiddlePanel() {
  const selectedMemoryId = useMemoryStore((s) => s.selectedMemoryId);
  const memories = useMemoryStore((s) => s.memories);
  const selectedMemory = selectedMemoryId
    ? memories.find((m) => m.id === selectedMemoryId)
    : null;

  // Detail view
  if (selectedMemory) {
    return <MemoryDetail memory={selectedMemory} />;
  }

  return <ProjectBrief />;
}
