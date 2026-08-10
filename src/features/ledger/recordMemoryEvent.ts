import { eventLedger, type EventLedger } from "@/ledger";
import type { Memory } from "@/types/memory";

const CONTENT_ROLE = "memory.content";

/** Records a complete memory creation before the legacy projection is written. */
export async function recordMemoryCreated(
  memory: Memory,
  ledger: EventLedger = eventLedger
): Promise<void> {
  const { content, ...projection } = memory;
  await ledger.append({
    streamId: memoryStream(memory.id),
    type: "memory.created.v1",
    occurredAt: memory.created_at,
    correlationId: memory.id,
    payload: { projection },
    objects: [contentObject(content)],
  });
}

/** Records changed fields, the resulting projection, and deduplicated content. */
export async function recordMemoryUpdated(
  {
    before,
    after,
    changes,
  }: {
    before: Memory;
    after: Memory;
    changes: Partial<Memory>;
  },
  ledger: EventLedger = eventLedger
): Promise<void> {
  const { content: afterContent, ...afterProjection } = after;
  const changedProjection = { ...changes };
  delete changedProjection.content;
  await ledger.append({
    streamId: memoryStream(after.id),
    type: "memory.updated.v1",
    occurredAt: after.updated_at,
    correlationId: after.id,
    payload: {
      previousUpdatedAt: before.updated_at,
      changes: changedProjection,
      projection: afterProjection,
    },
    objects: [contentObject(afterContent)],
  });
}

/** Records the final projection and content reference before deletion. */
export async function recordMemoryDeleted(
  memory: Memory,
  ledger: EventLedger = eventLedger
): Promise<void> {
  const { content, ...projection } = memory;
  await ledger.append({
    streamId: memoryStream(memory.id),
    type: "memory.deleted.v1",
    correlationId: memory.id,
    payload: { projection },
    objects: [contentObject(content)],
  });
}

function memoryStream(memoryId: string): string {
  return `memory:${memoryId}`;
}

function contentObject(content: string) {
  return {
    role: CONTENT_ROLE,
    data: content,
    mediaType: content.startsWith("data:image/")
      ? content.slice(5, content.indexOf(";")) || "image/unknown"
      : "text/plain;charset=utf-8",
  };
}
