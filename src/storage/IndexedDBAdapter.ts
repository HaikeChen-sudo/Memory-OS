import { storageRecordId, type StorageAdapter } from "./types";

const DB_NAME = "memory-os";
const DB_VERSION = 3;

const STORES = [
  "folders",
  "memories",
  "sessions",
  "messages",
  "connections",
  "settings",
  "files",
  "file_contents",
] as const;

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private ready: Promise<void> | null = null;
  private _isServer: boolean;

  constructor() {
    this._isServer = typeof indexedDB === "undefined";
  }

  private init(): Promise<void> {
    if (this._isServer) {
      return Promise.reject(new Error("IndexedDB is not available on the server"));
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: "id" });
          }
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  private async ensureReady(): Promise<IDBDatabase> {
    if (this._isServer) {
      throw new Error("IndexedDB is not available on the server");
    }
    if (!this.ready) {
      this.ready = this.init();
    }
    await this.ready;
    if (!this.db) throw new Error("IndexedDB not initialized");
    return this.db;
  }

  private tx(store: string, mode: IDBTransactionMode = "readonly") {
    if (!this.db) throw new Error("IndexedDB not initialized");
    const transaction = this.db.transaction(store, mode);
    return transaction.objectStore(store);
  }

  private promisify<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async save<T>(collection: string, id: string, data: T): Promise<void> {
    await this.ensureReady();
    const store = this.tx(collection, "readwrite");
    await this.promisify(store.put({ ...(data as object), id }));
  }

  async read<T>(collection: string, id: string): Promise<T | null> {
    await this.ensureReady();
    const store = this.tx(collection);
    const result = await this.promisify(store.get(id));
    return (result as T) ?? null;
  }

  async readAll<T>(collection: string): Promise<T[]> {
    await this.ensureReady();
    const store = this.tx(collection);
    return this.promisify(store.getAll()) as Promise<T[]>;
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.ensureReady();
    const store = this.tx(collection, "readwrite");
    await this.promisify(store.delete(id));
  }

  async query<T>(
    collection: string,
    predicate: (item: T) => boolean
  ): Promise<T[]> {
    const all = await this.readAll<T>(collection);
    return all.filter(predicate);
  }

  async clear(collection: string): Promise<void> {
    await this.ensureReady();
    const store = this.tx(collection, "readwrite");
    await this.promisify(store.clear());
  }

  async exportAll(): Promise<Record<string, unknown[]>> {
    const result: Record<string, unknown[]> = {};
    for (const store of STORES) {
      result[store] = await this.readAll(store);
    }
    return result;
  }

  async importAll(data: Record<string, unknown[]>): Promise<void> {
    const db = await this.ensureReady();
    const entries = Object.entries(data);
    if (entries.length === 0) return;

    const knownStores = new Set<string>(STORES);
    for (const [collection, items] of entries) {
      if (!knownStores.has(collection)) throw new Error(`Unknown collection: ${collection}`);
      for (const item of items) storageRecordId(collection, item);
    }

    const storeNames = entries.map(([c]) => c);
    const tx = db.transaction(storeNames, "readwrite");
    for (const [collection, items] of entries) {
      const store = tx.objectStore(collection);
      store.clear();
      for (const item of items) {
        store.put({ ...(item as object), id: storageRecordId(collection, item) });
      }
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("IndexedDB import aborted"));
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB import failed"));
    });
  }
}
