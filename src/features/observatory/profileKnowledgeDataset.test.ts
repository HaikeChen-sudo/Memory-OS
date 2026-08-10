import assert from "node:assert/strict";
import test from "node:test";
import type { Memory } from "../../types/memory";
import { profileKnowledgeDataset } from "./profileKnowledgeDataset";

const NOW = new Date("2026-08-10T12:00:00.000Z");

function memory(index: number, content = `token${index} feature${index} evidence${index}`): Memory {
  return {
    id: `memory-${index}`,
    folder_id: "folder-1",
    type: "note",
    title: `title${index} subject${index}`,
    content,
    created_at: new Date(NOW.getTime() - index * 1000).toISOString(),
    updated_at: new Date(NOW.getTime() - index * 1000).toISOString(),
    source_id: null,
    source_url: null,
    summary: null,
    preview: null,
    time_layer: "today",
    embedding: null,
    position: null,
    color: "#000000",
    animation_state: "idle",
    keywords: null,
    metadata: {},
  };
}

test("duplicate analysis covers records beyond the first 200", () => {
  const memories = Array.from({ length: 201 }, (_, index) => memory(index));
  memories[200] = {
    ...memories[0],
    id: "memory-200",
    created_at: new Date(NOW.getTime() - 200_000).toISOString(),
    updated_at: new Date(NOW.getTime() - 200_000).toISOString(),
  };

  const profile = profileKnowledgeDataset({ memories, now: NOW });

  assert.equal(profile.pairCount, 201 * 200 / 2);
  assert.ok(profile.duplicatePairCount >= 1);
  assert.ok(profile.duplicateCandidates.some((candidate) =>
    new Set([candidate.leftMemoryId, candidate.rightMemoryId]).size === 2
    && [candidate.leftMemoryId, candidate.rightMemoryId].includes("memory-0")
    && [candidate.leftMemoryId, candidate.rightMemoryId].includes("memory-200")
  ));
  assert.ok(profile.uniqueness.value < 100);
});
