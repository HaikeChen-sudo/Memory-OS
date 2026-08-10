import assert from "node:assert/strict";
import test from "node:test";
import { ServerStorageAdapter } from "./ServerStorageAdapter";
import type { StorageAdapter } from "./types";

class MemoryAdapter implements StorageAdapter {
  private readonly collections = new Map<string, Map<string, unknown>>();

  async save<T>(collection: string, id: string, data: T): Promise<void> {
    this.collection(collection).set(id, structuredClone(data));
  }

  async read<T>(collection: string, id: string): Promise<T | null> {
    return (this.collection(collection).get(id) as T | undefined) ?? null;
  }

  async readAll<T>(collection: string): Promise<T[]> {
    return [...this.collection(collection).values()] as T[];
  }

  async delete(collection: string, id: string): Promise<void> {
    this.collection(collection).delete(id);
  }

  async query<T>(collection: string, predicate: (item: T) => boolean): Promise<T[]> {
    return (await this.readAll<T>(collection)).filter(predicate);
  }

  async clear(collection: string): Promise<void> {
    this.collection(collection).clear();
  }

  async exportAll(): Promise<Record<string, unknown[]>> {
    return Object.fromEntries(
      [...this.collections].map(([name, records]) => [name, [...records.values()]])
    );
  }

  async importAll(data: Record<string, unknown[]>): Promise<void> {
    for (const [collection, records] of Object.entries(data)) {
      await this.clear(collection);
      for (const record of records) {
        const id = (record as { id?: string }).id;
        if (id) await this.save(collection, id, record);
      }
    }
  }

  private collection(name: string): Map<string, unknown> {
    let collection = this.collections.get(name);
    if (!collection) {
      collection = new Map();
      this.collections.set(name, collection);
    }
    return collection;
  }
}

class MemoryKeyValueStore {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("replays an offline write before reading from a recovered server", async () => {
  const local = new MemoryAdapter();
  const durableQueue = new MemoryKeyValueStore();
  const server = new MemoryAdapter();
  let online = false;
  const fetcher: typeof fetch = async (_input, init) => {
    if (!online) return Response.json({ error: "offline" }, { status: 500 });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    const action = body.action;
    if (action === "save") {
      await server.save(String(body.collection), String(body.id), body.data);
      return Response.json({ data: null });
    }
    if (action === "readAll") {
      const data = await server.readAll(String(body.collection));
      return Response.json({ data });
    }
    return Response.json({ data: null });
  };
  const first = new ServerStorageAdapter({
    localFallback: local,
    fetcher,
    keyValueStore: durableQueue,
    serverEnvironment: false,
  });

  await first.save("memories", "memory-1", { id: "memory-1", title: "离线写入" });
  online = true;

  const afterReload = new ServerStorageAdapter({
    localFallback: local,
    fetcher,
    keyValueStore: durableQueue,
    serverEnvironment: false,
  });
  const visible = await afterReload.readAll<{ id: string }>("memories");

  assert.deepEqual(visible.map((item) => item.id), ["memory-1"]);
  assert.equal((await server.readAll("memories")).length, 1);
});
