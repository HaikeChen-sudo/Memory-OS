import type {
  EventDraft,
  EventEnvelope,
  EventLedgerAdapter,
  StoredContentObject,
} from "./types";

const DB_NAME = "memory-os-v2-ledger";
const DB_VERSION = 1;
const EVENTS = "events";
const HEADS = "heads";
const OBJECTS = "objects";

interface StreamHead {
  streamId: string;
  sequence: number;
}

/** IndexedDB adapter with atomic stream sequencing and object deduplication. */
export class IndexedDBLedgerAdapter implements EventLedgerAdapter {
  private database: Promise<IDBDatabase> | null = null;

  append(event: EventDraft, objects: StoredContentObject[]): Promise<EventEnvelope> {
    return this.open().then((database) => new Promise((resolve, reject) => {
      const transaction = database.transaction([EVENTS, HEADS, OBJECTS], "readwrite");
      const eventStore = transaction.objectStore(EVENTS);
      const headStore = transaction.objectStore(HEADS);
      const objectStore = transaction.objectStore(OBJECTS);
      const headRequest = headStore.get(event.streamId);
      let envelope: EventEnvelope | null = null;

      headRequest.onsuccess = () => {
        const head = headRequest.result as StreamHead | undefined;
        const sequence = (head?.sequence ?? 0) + 1;
        envelope = { ...event, sequence };
        eventStore.add(envelope);
        headStore.put({ streamId: event.streamId, sequence } satisfies StreamHead);
        for (const object of objects) objectStore.put(object);
      };
      headRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        if (envelope) resolve(envelope);
        else reject(new Error("Event transaction completed without an envelope"));
      };
      transaction.onabort = () => reject(transaction.error ?? new Error("Event transaction aborted"));
      transaction.onerror = () => reject(transaction.error ?? new Error("Event transaction failed"));
    }));
  }

  async readStream(streamId: string, afterSequence: number): Promise<EventEnvelope[]> {
    const database = await this.open();
    const transaction = database.transaction(EVENTS, "readonly");
    const index = transaction.objectStore(EVENTS).index("by_stream_sequence");
    const range = IDBKeyRange.bound(
      [streamId, afterSequence + 1],
      [streamId, Number.MAX_SAFE_INTEGER]
    );
    return this.request<EventEnvelope[]>(index.getAll(range));
  }

  async readObject(hash: string): Promise<StoredContentObject | null> {
    const database = await this.open();
    const transaction = database.transaction(OBJECTS, "readonly");
    const object = await this.request<StoredContentObject | undefined>(
      transaction.objectStore(OBJECTS).get(hash)
    );
    return object ?? null;
  }

  async listStreams(prefix: string): Promise<string[]> {
    const database = await this.open();
    const transaction = database.transaction(HEADS, "readonly");
    const keys = await this.request<IDBValidKey[]>(transaction.objectStore(HEADS).getAllKeys());
    return keys
      .filter((key): key is string => typeof key === "string" && key.startsWith(prefix))
      .sort();
  }

  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = this.openDatabase();
    return this.database;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(EVENTS)) {
          const events = database.createObjectStore(EVENTS, { keyPath: "eventId" });
          events.createIndex("by_stream_sequence", ["streamId", "sequence"], { unique: true });
          events.createIndex("by_occurred_at", "occurredAt");
        }
        if (!database.objectStoreNames.contains(HEADS)) {
          database.createObjectStore(HEADS, { keyPath: "streamId" });
        }
        if (!database.objectStoreNames.contains(OBJECTS)) {
          database.createObjectStore(OBJECTS, { keyPath: "hash" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open event ledger"));
      request.onblocked = () => reject(new Error("Event ledger upgrade is blocked"));
    });
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
  }
}
