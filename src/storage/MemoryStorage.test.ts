import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "../types";
import { MemoryStorage } from "./MemoryStorage";
import type { StorageAdapter } from "./types";

class QueryOrderAdapter implements StorageAdapter {
  constructor(private readonly messages: Message[]) {}

  async save<T>(...input: [collection: string, id: string, data: T]): Promise<void> {
    void input;
  }
  async read<T>(): Promise<T | null> { return null; }
  async readAll<T>(): Promise<T[]> { return []; }
  async delete(): Promise<void> { return undefined; }
  async query<T>(): Promise<T[]> { return this.messages as T[]; }
  async queryByField<T>(): Promise<T[]> { return this.messages as T[]; }
  async clear(): Promise<void> { return undefined; }
  async exportAll(): Promise<Record<string, unknown[]>> { return {}; }
  async importAll(): Promise<void> { return undefined; }
}

function message(id: string, createdAt: string): Message {
  return {
    id,
    session_id: "session-1",
    role: "user",
    content: id,
    citations: [],
    animation_state: "idle",
    created_at: createdAt,
  };
}

test("returns chat messages in deterministic chronological order", async () => {
  const storage = new MemoryStorage(new QueryOrderAdapter([
    message("current", "2026-08-10T12:00:00.000Z"),
    message("old", "2026-08-09T12:00:00.000Z"),
  ]));

  const messages = await storage.readMessagesBySession("session-1");

  assert.deepEqual(messages.map((item) => item.id), ["old", "current"]);
});
