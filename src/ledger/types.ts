export type LedgerEventType =
  | "memory.created.v1"
  | "memory.updated.v1"
  | "memory.deleted.v1";

export interface ContentObjectInput {
  role: string;
  data: string;
  mediaType: string;
}

export interface ContentObjectRef {
  role: string;
  hash: string;
  byteLength: number;
  mediaType: string;
}

export interface StoredContentObject {
  hash: string;
  data: string;
  byteLength: number;
  mediaType: string;
  storedAt: string;
}

export interface AppendEventInput {
  streamId: string;
  type: LedgerEventType;
  payload: unknown;
  objects?: ContentObjectInput[];
  occurredAt?: string;
  correlationId?: string;
  causationId?: string | null;
}

export interface EventEnvelope {
  eventId: string;
  streamId: string;
  sequence: number;
  type: LedgerEventType;
  schemaVersion: 1;
  occurredAt: string;
  correlationId: string;
  causationId: string | null;
  payloadHash: string;
  payload: unknown;
  objects: ContentObjectRef[];
}

export type EventDraft = Omit<EventEnvelope, "sequence">;

export interface EventLedgerAdapter {
  append(event: EventDraft, objects: StoredContentObject[]): Promise<EventEnvelope>;
  readStream(streamId: string, afterSequence: number): Promise<EventEnvelope[]>;
  listStreams(prefix: string): Promise<string[]>;
  readObject(hash: string): Promise<StoredContentObject | null>;
}
