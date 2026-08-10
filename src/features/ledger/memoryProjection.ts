import type { EventEnvelope, EventLedger } from "@/ledger";
import { stableSerialize } from "@/ledger/contentHash";
import type { Memory } from "@/types/memory";

const MEMORY_STREAM_PREFIX = "memory:";
const CONTENT_ROLE = "memory.content";

export interface MemoryProjectionStore {
  readMemory(id: string): Promise<Memory | null>;
  saveMemory(memory: Memory): Promise<void>;
  deleteMemory(id: string): Promise<void>;
}

interface ReplayResult {
  hasEvents: boolean;
  memory: Memory | null;
  folderId: string | null;
}

/** Rebuilds legacy memory rows from the append-only ledger after partial writes. */
export class MemoryProjectionService {
  constructor(
    private readonly ledger: EventLedger,
    private readonly store: MemoryProjectionStore
  ) {}

  /** Reconciles one memory stream and returns its current projected state. */
  async reconcile(memoryId: string): Promise<Memory | null> {
    const replay = await this.replay(memoryId);
    if (!replay.hasEvents) return this.store.readMemory(memoryId);
    await this.persist(memoryId, replay.memory);
    return replay.memory;
  }

  /** Reconciles all ledger-backed memories, optionally scoped to one folder. */
  async reconcileAll(folderId?: string): Promise<void> {
    const streams = await this.ledger.listStreams(MEMORY_STREAM_PREFIX);
    for (const streamId of streams) {
      const memoryId = streamId.slice(MEMORY_STREAM_PREFIX.length);
      const replay = await this.replay(memoryId);
      if (folderId && replay.folderId !== folderId) continue;
      await this.persist(memoryId, replay.memory);
    }
  }

  private async replay(memoryId: string): Promise<ReplayResult> {
    const events = await this.ledger.readStream(`${MEMORY_STREAM_PREFIX}${memoryId}`);
    let current: Memory | null = null;
    let content: string | null = (await this.store.readMemory(memoryId))?.content ?? null;
    let folderId: string | null = null;

    for (const event of events) {
      if (event.type === "memory.deleted.v1") {
        folderId = projectionFrom(event, memoryId).folder_id;
        current = null;
        continue;
      }
      const projection = projectionFrom(event, memoryId);
      folderId = projection.folder_id;
      content = await this.resolveContent(event, content);
      if (content === null) throw new Error(`Memory ${memoryId} has no content object`);
      current = { ...projection, content };
    }

    return { hasEvents: events.length > 0, memory: current, folderId };
  }

  private async resolveContent(event: EventEnvelope, previous: string | null): Promise<string | null> {
    const reference = event.objects.find((object) => object.role === CONTENT_ROLE);
    if (!reference) return previous;
    const stored = await this.ledger.readObject(reference.hash);
    if (!stored) throw new Error(`Missing ledger object ${reference.hash}`);
    return stored.data;
  }

  private async persist(memoryId: string, projected: Memory | null): Promise<void> {
    const stored = await this.store.readMemory(memoryId);
    if (projected === null) {
      if (stored) await this.store.deleteMemory(memoryId);
      return;
    }
    if (!stored || stableSerialize(stored) !== stableSerialize(projected)) {
      await this.store.saveMemory(projected);
    }
  }
}

function projectionFrom(event: EventEnvelope, memoryId: string): Omit<Memory, "content"> {
  if (!event.payload || typeof event.payload !== "object") {
    throw new Error(`Invalid ${event.type} payload`);
  }
  const projection = (event.payload as { projection?: unknown }).projection;
  if (!projection || typeof projection !== "object") {
    throw new Error(`Missing projection in ${event.type}`);
  }
  const record = projection as Record<string, unknown>;
  if (record.id !== memoryId || typeof record.folder_id !== "string") {
    throw new Error(`Projection identity mismatch for ${memoryId}`);
  }
  return projection as Omit<Memory, "content">;
}
