import { IndexedDBAdapter } from "./IndexedDBAdapter";
import { storageRecordId, type StorageAdapter } from "./types";

const OUTBOX_KEY = "memory-os-storage-outbox-v1";

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type StorageMutation =
  | { action: "save"; collection: string; id: string }
  | { action: "delete"; collection: string; id: string }
  | { action: "clear"; collection: string }
  | { action: "importAll" };

interface ServerStorageAdapterOptions {
  localFallback?: StorageAdapter;
  fetcher?: typeof fetch;
  keyValueStore?: KeyValueStore | null;
  serverEnvironment?: boolean;
}

class RetryableStorageError extends Error {}

/**
 * Proxies storage to the server while keeping a local replica and durable
 * mutation outbox. Reads never bypass offline writes waiting for replay.
 */
export class ServerStorageAdapter implements StorageAdapter {
  private readonly localFallback: StorageAdapter;
  private readonly fetcher: typeof fetch;
  private readonly keyValueStore: KeyValueStore | null;
  private readonly serverEnvironment: boolean;
  private pendingMutations: StorageMutation[];
  private flushPromise: Promise<boolean> | null = null;
  private mutationVersion = 0;

  constructor(options: ServerStorageAdapterOptions = {}) {
    this.localFallback = options.localFallback ?? new IndexedDBAdapter();
    this.fetcher = options.fetcher ?? fetch;
    this.keyValueStore = options.keyValueStore === undefined
      ? browserKeyValueStore()
      : options.keyValueStore;
    this.serverEnvironment = options.serverEnvironment ?? typeof window === "undefined";
    this.pendingMutations = this.loadOutbox();
  }

  async save<T>(collection: string, id: string, data: T): Promise<void> {
    await this.mutate(
      { action: "save", collection, id },
      () => this.localFallback.save(collection, id, data)
    );
  }

  async read<T>(collection: string, id: string): Promise<T | null> {
    return this.queryServer<T | null>({ action: "read", collection, id }, {
      local: () => this.localFallback.read<T>(collection, id),
      cache: async (record) => {
        if (record === null) await this.localFallback.delete(collection, id);
        else await this.localFallback.save(collection, id, record);
      },
    });
  }

  async readAll<T>(collection: string): Promise<T[]> {
    return this.queryServer<T[]>({ action: "readAll", collection }, {
      local: () => this.localFallback.readAll<T>(collection),
      cache: async (records) => {
        await this.localFallback.clear(collection);
        for (const record of records) {
          await this.localFallback.save(collection, storageRecordId(collection, record), record);
        }
      },
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.mutate(
      { action: "delete", collection, id },
      () => this.localFallback.delete(collection, id)
    );
  }

  async query<T>(collection: string, predicate: (item: T) => boolean): Promise<T[]> {
    const all = await this.readAll<T>(collection);
    return all.filter(predicate);
  }

  async queryByField<T>(collection: string, field: string, value: string): Promise<T[]> {
    return this.queryServer<T[]>({ action: "queryByField", collection, field, value }, {
      local: () => this.localFallback.query<T>(
        collection,
        (item) => (item as Record<string, unknown>)[field] === value
      ),
      cache: async (records) => {
        for (const record of records) {
          await this.localFallback.save(collection, storageRecordId(collection, record), record);
        }
      },
    });
  }

  async clear(collection: string): Promise<void> {
    await this.mutate(
      { action: "clear", collection },
      () => this.localFallback.clear(collection)
    );
  }

  async exportAll(): Promise<Record<string, unknown[]>> {
    return this.queryServer<Record<string, unknown[]>>({ action: "exportAll" }, {
      local: () => this.localFallback.exportAll(),
      cache: (data) => this.localFallback.importAll(data),
    });
  }

  async importAll(data: Record<string, unknown[]>): Promise<void> {
    await this.mutate(
      { action: "importAll" },
      () => this.localFallback.importAll(data)
    );
  }

  private async mutate(
    mutation: StorageMutation,
    localOperation: () => Promise<void>
  ): Promise<void> {
    if (this.serverEnvironment) return;
    this.mutationVersion += 1;
    await localOperation();
    this.pendingMutations.push(mutation);
    this.persistOutbox();
    await this.flushPendingMutations();
  }

  private async queryServer<T>(
    body: Record<string, unknown>,
    operations: {
      local: () => Promise<T>;
      cache: (result: T) => Promise<void>;
    }
  ): Promise<T> {
    if (this.serverEnvironment) return emptyServerResult(body.action) as T;
    const flushed = await this.flushPendingMutations();
    if (!flushed) return operations.local();

    try {
      const cacheVersion = this.mutationVersion;
      const result = await this.send<T>(body);
      if (this.mutationVersion !== cacheVersion) return operations.local();
      try {
        await operations.cache(result);
      } catch {
        // A failed cache refresh must not hide a successful server response.
      }
      return result;
    } catch (error) {
      if (error instanceof RetryableStorageError) return operations.local();
      throw error;
    }
  }

  private flushPendingMutations(): Promise<boolean> {
    if (!this.flushPromise) {
      this.flushPromise = this.runFlush().finally(() => {
        this.flushPromise = null;
      });
    }
    return this.flushPromise;
  }

  private async runFlush(): Promise<boolean> {
    while (this.pendingMutations.length > 0) {
      try {
        const body = await this.materializeMutation(this.pendingMutations[0]);
        if (body) await this.send(body);
      } catch (error) {
        if (error instanceof RetryableStorageError) return false;
        this.pendingMutations.shift();
        this.persistOutbox();
        throw error;
      }
      this.pendingMutations.shift();
      this.persistOutbox();
    }
    return true;
  }

  private async materializeMutation(
    mutation: StorageMutation
  ): Promise<Record<string, unknown> | null> {
    if (mutation.action === "save") {
      const data = await this.localFallback.read(mutation.collection, mutation.id);
      return data === null ? null : { ...mutation, data };
    }
    if (mutation.action === "importAll") {
      return { action: "importAll", data: await this.localFallback.exportAll() };
    }
    return mutation;
  }

  private async send<T>(body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new RetryableStorageError("Storage server is unreachable", { cause: error });
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: "Unknown error" }));
      const message = (payload as { error?: string }).error ?? `Storage API error: ${response.status}`;
      if (response.status >= 500) throw new RetryableStorageError(message);
      throw new Error(message);
    }

    const payload = await response.json() as { data: T };
    return payload.data;
  }

  private loadOutbox(): StorageMutation[] {
    if (!this.keyValueStore) return [];
    try {
      const raw = this.keyValueStore.getItem(OUTBOX_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(isStorageMutation) : [];
    } catch {
      return [];
    }
  }

  private persistOutbox(): void {
    if (!this.keyValueStore) return;
    try {
      this.keyValueStore.setItem(OUTBOX_KEY, JSON.stringify(this.pendingMutations));
    } catch {
      // The in-memory queue still protects the current session.
    }
  }
}

function browserKeyValueStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function emptyServerResult(action: unknown): unknown {
  if (action === "readAll" || action === "queryByField") return [];
  if (action === "exportAll") return {};
  if (action === "read") return null;
  return undefined;
}

function isStorageMutation(value: unknown): value is StorageMutation {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.action === "importAll") return true;
  if (record.action === "clear") return typeof record.collection === "string";
  return (record.action === "save" || record.action === "delete")
    && typeof record.collection === "string"
    && typeof record.id === "string";
}
