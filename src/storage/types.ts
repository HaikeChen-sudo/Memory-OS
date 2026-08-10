/**
 * StorageAdapter — unified storage interface.
 *
 * All business logic calls these methods.
 * The underlying implementation (IndexedDB, cloud, memory) is invisible to callers.
 *
 * Future: CloudAdapter implements this same interface for sync mode.
 */

export interface StorageAdapter {
  save<T>(collection: string, id: string, data: T): Promise<void>;
  read<T>(collection: string, id: string): Promise<T | null>;
  readAll<T>(collection: string): Promise<T[]>;
  delete(collection: string, id: string): Promise<void>;
  query<T>(
    collection: string,
    predicate: (item: T) => boolean
  ): Promise<T[]>;
  /**
   * Optimized field-equality query.
   * MySQL adapter translates to WHERE field = value.
   * IndexedDB adapter falls back to readAll + filter.
   */
  queryByField?<T>(collection: string, field: string, value: string): Promise<T[]>;
  clear(collection: string): Promise<void>;
  exportAll(): Promise<Record<string, unknown[]>>;
  importAll(data: Record<string, unknown[]>): Promise<void>;
}

export type StorageMode = "local" | "cloud" | "hybrid";

export interface StorageConfig {
  mode: StorageMode;
  adapter: StorageAdapter;
}

export const COLLECTIONS = {
  FOLDERS: "folders",
  MEMORIES: "memories",
  SESSIONS: "sessions",
  MESSAGES: "messages",
  CONNECTIONS: "connections",
  SETTINGS: "settings",
  FILES: "files",
  FILE_CONTENTS: "file_contents",
} as const;

const PRIMARY_KEY_FIELDS: Readonly<Record<string, string>> = {
  file_contents: "file_id",
};

/** Returns the domain primary key used by a portable export record. */
export function storagePrimaryKeyField(collection: string): string {
  return PRIMARY_KEY_FIELDS[collection] ?? "id";
}

/** Reads and validates a record key before import. */
export function storageRecordId(collection: string, record: unknown): string {
  if (!record || typeof record !== "object") {
    throw new TypeError(`Invalid ${collection} import record`);
  }
  const field = storagePrimaryKeyField(collection);
  const id = (record as Record<string, unknown>)[field];
  if (typeof id !== "string" || !id.trim()) {
    throw new TypeError(`${collection} import record needs ${field}`);
  }
  return id;
}
