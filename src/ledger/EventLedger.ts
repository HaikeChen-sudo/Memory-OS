import { sha256, stableSerialize } from "./contentHash";
import type {
  AppendEventInput,
  ContentObjectRef,
  EventDraft,
  EventEnvelope,
  EventLedgerAdapter,
  StoredContentObject,
} from "./types";

/**
 * Records immutable domain events and content-addressed objects atomically.
 * Callers do not manage stream sequences, hashes, or object deduplication.
 */
export class EventLedger {
  constructor(private readonly adapter: EventLedgerAdapter) {}

  /** Appends one event and returns the persisted envelope with its stream sequence. */
  async append(input: AppendEventInput): Promise<EventEnvelope> {
    const occurredAt = input.occurredAt ?? new Date().toISOString();
    const materializedObjects = await Promise.all(
      (input.objects ?? []).map(async (object): Promise<StoredContentObject> => ({
        hash: await sha256(object.data),
        data: object.data,
        byteLength: new TextEncoder().encode(object.data).byteLength,
        mediaType: object.mediaType,
        storedAt: occurredAt,
      }))
    );
    const objectRefs: ContentObjectRef[] = (input.objects ?? []).map((object, index) => ({
      role: object.role,
      hash: materializedObjects[index].hash,
      byteLength: materializedObjects[index].byteLength,
      mediaType: object.mediaType,
    }));
    const eventId = crypto.randomUUID();
    const draft: EventDraft = {
      eventId,
      streamId: input.streamId,
      type: input.type,
      schemaVersion: 1,
      occurredAt,
      correlationId: input.correlationId ?? eventId,
      causationId: input.causationId ?? null,
      payloadHash: await sha256(stableSerialize({ payload: input.payload, objects: objectRefs })),
      payload: input.payload,
      objects: objectRefs,
    };
    return this.adapter.append(draft, materializedObjects);
  }

  /** Reads one stream in ascending sequence order. */
  readStream(streamId: string, afterSequence = 0): Promise<EventEnvelope[]> {
    if (!streamId.trim()) return Promise.reject(new Error("streamId is required"));
    if (!Number.isInteger(afterSequence) || afterSequence < 0) {
      return Promise.reject(new Error("afterSequence must be a non-negative integer"));
    }
    return this.adapter.readStream(streamId, afterSequence);
  }

  /** Lists known streams in stable order so projections can recover after failure. */
  listStreams(prefix = ""): Promise<string[]> {
    return this.adapter.listStreams(prefix);
  }

  /** Resolves an immutable object referenced by an event. */
  readObject(hash: string): Promise<StoredContentObject | null> {
    if (!/^[a-f0-9]{64}$/.test(hash)) return Promise.reject(new Error("invalid SHA-256 hash"));
    return this.adapter.readObject(hash);
  }
}
