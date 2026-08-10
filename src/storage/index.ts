export type { StorageAdapter, StorageMode, StorageConfig } from "./types";
export { COLLECTIONS } from "./types";
export { MemoryStorage } from "./MemoryStorage";

// NOTE: MySQLAdapter and IndexedDBAdapter are NOT exported from here.
// MySQLAdapter imports mysql2 (Node.js net/tls) and must only be used
// in server-side API routes. Import it directly:
//   import { MySQLAdapter } from "@/storage/MySQLAdapter";
// IndexedDBAdapter is kept for reference / future offline mode.

import { ServerStorageAdapter } from "./ServerStorageAdapter";
import { MemoryStorage } from "./MemoryStorage";

let _storage: MemoryStorage | null = null;

function getStorage(): MemoryStorage {
  if (!_storage) {
    const adapter = new ServerStorageAdapter();
    _storage = new MemoryStorage(adapter);
  }
  return _storage;
}

export const storage = new Proxy({} as MemoryStorage, {
  get(_, prop: keyof MemoryStorage) {
    const s = getStorage();
    const value = s[prop];
    if (typeof value === "function") {
      return (...args: unknown[]) => {
        // On server (SSR), return safe defaults without making HTTP requests
        if (typeof window === "undefined") {
          const propName = String(prop);
          if (
            propName === "readAllMemories" ||
            propName === "readAllSessions" ||
            propName === "readAllFolders" ||
            propName === "readAllFiles" ||
            propName === "exportAll"
          ) {
            return Promise.resolve([]);
          }
          if (
            propName === "readMemory" ||
            propName === "readMessagesBySession" ||
            propName === "readFile" ||
            propName === "readFileContent" ||
            propName === "getFileByMemoryId"
          ) {
            return Promise.resolve(null);
          }
          return Promise.resolve(undefined);
        }
        return (value as (...a: unknown[]) => unknown).apply(s, args);
      };
    }
    return value;
  },
}) as MemoryStorage;
