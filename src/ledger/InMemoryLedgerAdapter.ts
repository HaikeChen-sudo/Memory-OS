import type {
  EventDraft,
  EventEnvelope,
  EventLedgerAdapter,
  StoredContentObject,
} from "./types";

/** In-memory adapter used by server rendering and deterministic tests. */
export class InMemoryLedgerAdapter implements EventLedgerAdapter {
  private readonly events: EventEnvelope[] = [];
  private readonly heads = new Map<string, number>();
  private readonly objects = new Map<string, StoredContentObject>();

  async append(event: EventDraft, objects: StoredContentObject[]): Promise<EventEnvelope> {
    const sequence = (this.heads.get(event.streamId) ?? 0) + 1;
    const envelope: EventEnvelope = { ...event, sequence };
    for (const object of objects) this.objects.set(object.hash, object);
    this.events.push(envelope);
    this.heads.set(event.streamId, sequence);
    return envelope;
  }

  async readStream(streamId: string, afterSequence: number): Promise<EventEnvelope[]> {
    return this.events.filter(
      (event) => event.streamId === streamId && event.sequence > afterSequence
    );
  }

  async listStreams(prefix: string): Promise<string[]> {
    return [...this.heads.keys()]
      .filter((streamId) => streamId.startsWith(prefix))
      .sort();
  }

  async readObject(hash: string): Promise<StoredContentObject | null> {
    return this.objects.get(hash) ?? null;
  }
}
