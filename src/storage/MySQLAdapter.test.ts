import assert from "node:assert/strict";
import test from "node:test";
import type { getDb } from "../db";
import { MySQLAdapter } from "./MySQLAdapter";

type Database = Awaited<ReturnType<typeof getDb>>;

test("uses one native upsert without deleting the existing row", async () => {
  const operations: string[] = [];
  const database = {
    insert: () => ({
      values: () => ({
        onDuplicateKeyUpdate: async () => {
          operations.push("upsert");
        },
      }),
    }),
    delete: () => {
      operations.push("delete");
      throw new Error("save must not delete first");
    },
  } as unknown as Database;
  const adapter = new MySQLAdapter({ database: async () => database });

  await adapter.save("settings", "setting-1", {
    id: "setting-1",
    key: "theme",
    value: "dark",
  });

  assert.deepEqual(operations, ["upsert"]);
});

test("imports through one transaction and normalizes file-content keys", async () => {
  const inserted: Record<string, unknown>[] = [];
  let transactionCount = 0;
  const database = {
    transaction: async (run: (transaction: unknown) => Promise<void>) => {
      transactionCount += 1;
      await run({
        delete: async () => undefined,
        insert: () => ({
          values: async (record: Record<string, unknown>) => {
            inserted.push(record);
          },
        }),
      });
    },
  } as unknown as Database;
  const adapter = new MySQLAdapter({ database: async () => database });

  await adapter.importAll({
    file_contents: [{
      id: "indexed-db-key",
      file_id: "file-1",
      extracted_text: "正文",
      chunks: ["正文"],
      extracted_at: "2026-08-10T00:00:00.000Z",
    }],
  });

  assert.equal(transactionCount, 1);
  assert.equal(inserted[0].file_id, "file-1");
  assert.equal(inserted[0].user_id, "default");
  assert.equal("id" in inserted[0], false);
});

test("converts only schema datetime fields", async () => {
  let inserted: Record<string, unknown> | null = null;
  const database = {
    insert: () => ({
      values: (record: Record<string, unknown>) => {
        inserted = record;
        return { onDuplicateKeyUpdate: async () => undefined };
      },
    }),
  } as unknown as Database;
  const adapter = new MySQLAdapter({ database: async () => database });

  await adapter.save("memories", "memory-1", {
    id: "memory-1",
    folder_id: "folder-1",
    type: "note",
    title: "时间文本",
    content: "2026-08-10T12:00:00Z 后继续部署",
    created_at: "2026-08-10T12:00:00.000Z",
    updated_at: "2026-08-10T12:00:00.000Z",
    metadata: {},
  });

  const record = inserted as Record<string, unknown> | null;
  assert.ok(record);
  assert.equal(record.content, "2026-08-10T12:00:00Z 后继续部署");
  assert.equal(record.created_at, "2026-08-10 12:00:00");
});
