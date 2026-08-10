import assert from "node:assert/strict";
import test from "node:test";
import { EventLedger, InMemoryLedgerAdapter } from "../../ledger";
import type { Memory } from "../../types/memory";
import {
  recordMemoryCreated,
  recordMemoryDeleted,
  recordMemoryUpdated,
} from "./recordMemoryEvent";
import { MemoryProjectionService, type MemoryProjectionStore } from "./memoryProjection";

function memory(): Memory {
  return {
    id: "memory-1",
    folder_id: "folder-1",
    type: "note",
    title: "可重放记忆",
    content: "事件中的正文",
    created_at: "2026-08-10T00:00:00.000Z",
    updated_at: "2026-08-10T00:00:00.000Z",
    source_id: null,
    source_url: null,
    summary: null,
    preview: null,
    time_layer: "today",
    embedding: null,
    position: null,
    color: "#000000",
    animation_state: "idle",
    keywords: null,
    metadata: {},
  };
}

class FlakyProjectionStore implements MemoryProjectionStore {
  current: Memory | null = null;
  failNextSave = true;

  async readMemory(): Promise<Memory | null> {
    return this.current;
  }

  async saveMemory(value: Memory): Promise<void> {
    if (this.failNextSave) {
      this.failNextSave = false;
      throw new Error("projection unavailable");
    }
    this.current = value;
  }

  async deleteMemory(): Promise<void> {
    this.current = null;
  }
}

test("replays a committed event after the projection write fails", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  const store = new FlakyProjectionStore();
  const projector = new MemoryProjectionService(ledger, store);
  const source = memory();
  await recordMemoryCreated(source, ledger);

  await assert.rejects(() => projector.reconcile(source.id), /projection unavailable/);
  assert.equal(store.current, null);

  await projector.reconcile(source.id);
  assert.deepEqual(store.current, source);
});

test("replays a deletion into the legacy projection", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  const store = new FlakyProjectionStore();
  store.failNextSave = false;
  const projector = new MemoryProjectionService(ledger, store);
  const source = memory();
  await recordMemoryCreated(source, ledger);
  await projector.reconcile(source.id);
  await recordMemoryDeleted(source, ledger);

  await projector.reconcile(source.id);

  assert.equal(store.current, null);
});

test("repairs a delete-only stream created for a historical V1 row", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  const store = new FlakyProjectionStore();
  store.failNextSave = false;
  store.current = memory();
  const projector = new MemoryProjectionService(ledger, store);
  await recordMemoryDeleted(store.current, ledger);

  await projector.reconcileAll("folder-1");

  assert.equal(store.current, null);
});

test("projects the first update made to a historical V1 row", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  const store = new FlakyProjectionStore();
  store.failNextSave = false;
  const before = memory();
  store.current = before;
  const after = { ...before, title: "更新后的标题", updated_at: "2026-08-10T01:00:00.000Z" };
  const projector = new MemoryProjectionService(ledger, store);
  await recordMemoryUpdated({ before, after, changes: { title: after.title } }, ledger);

  await projector.reconcile(after.id);

  assert.deepEqual(store.current, after);
});
