import assert from "node:assert/strict";
import test from "node:test";
import { EventLedger } from "./EventLedger";
import { InMemoryLedgerAdapter } from "./InMemoryLedgerAdapter";

test("assigns monotonic stream sequences and supports cursors", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  await ledger.append({ streamId: "memory:1", type: "memory.created.v1", payload: { title: "v1" } });
  await ledger.append({ streamId: "memory:1", type: "memory.updated.v1", payload: { title: "v2" } });

  const events = await ledger.readStream("memory:1", 1);

  assert.deepEqual(events.map((event) => event.sequence), [2]);
});

test("deduplicates content by hash and restores the original object", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  const object = { role: "memory.content", data: "同一份正文", mediaType: "text/plain" };
  const first = await ledger.append({
    streamId: "memory:1",
    type: "memory.created.v1",
    payload: { title: "v1" },
    objects: [object],
  });
  const second = await ledger.append({
    streamId: "memory:1",
    type: "memory.updated.v1",
    payload: { title: "v2" },
    objects: [object],
  });

  assert.equal(first.objects[0].hash, second.objects[0].hash);
  assert.equal((await ledger.readObject(first.objects[0].hash))?.data, object.data);
  assert.notEqual(first.payloadHash, second.payloadHash);
});

test("stable payload hashing ignores object key insertion order", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  const left = await ledger.append({
    streamId: "left",
    type: "memory.created.v1",
    payload: { title: "same", nested: { a: 1, b: 2 } },
  });
  const right = await ledger.append({
    streamId: "right",
    type: "memory.created.v1",
    payload: { nested: { b: 2, a: 1 }, title: "same" },
  });

  assert.equal(left.payloadHash, right.payloadHash);
});

test("rejects invalid cursors before reaching an adapter", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  await assert.rejects(() => ledger.readStream("memory:1", -1), /non-negative integer/);
});

test("lists streams by prefix for projection recovery", async () => {
  const ledger = new EventLedger(new InMemoryLedgerAdapter());
  await ledger.append({ streamId: "memory:2", type: "memory.created.v1", payload: {} });
  await ledger.append({ streamId: "experiment:1", type: "memory.created.v1", payload: {} });
  await ledger.append({ streamId: "memory:1", type: "memory.created.v1", payload: {} });

  assert.deepEqual(await ledger.listStreams("memory:"), ["memory:1", "memory:2"]);
});
