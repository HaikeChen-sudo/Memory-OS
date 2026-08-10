import assert from "node:assert/strict";
import test from "node:test";
import type { Memory } from "../../types/memory";
import { createProjectBrief } from "./projectBrief";

function imageMemory(content: string): Memory {
  return {
    id: "image-1",
    folder_id: "folder-1",
    type: "image",
    title: "架构截图",
    content,
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
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

test("does not scan image data URLs for action and risk keywords", () => {
  const brief = createProjectBrief({
    memories: [imageMemory("data:image/png;base64,todo-risk-issue")],
    now: new Date("2026-08-10T12:00:00.000Z"),
  });

  assert.deepEqual(brief.actions, []);
  assert.deepEqual(brief.risks, []);
});
