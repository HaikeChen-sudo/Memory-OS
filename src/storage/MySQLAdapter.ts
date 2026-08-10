import { eq, getTableColumns } from "drizzle-orm";
import type { AnyMySqlColumn, AnyMySqlTable } from "drizzle-orm/mysql-core";
import { getDb } from "@/db";
import {
  folders,
  memories,
  sessions,
  messages,
  connections,
  settings,
  files,
  fileContents,
} from "@/db/schema";
import { storagePrimaryKeyField, storageRecordId, type StorageAdapter } from "./types";

type Database = Awaited<ReturnType<typeof getDb>>;

interface MySQLAdapterOptions {
  database?: () => Promise<Database>;
}

const TABLES: Record<string, AnyMySqlTable> = {
  folders,
  memories,
  sessions,
  messages,
  connections,
  settings,
  files,
  file_contents: fileContents,
};

/**
 * MySQLAdapter — implements StorageAdapter using Drizzle ORM + MySQL.
 *
 * On-demand DB connection (lazy via getDb()) so this module can be
 * imported without immediately connecting to the database.
 */
export class MySQLAdapter implements StorageAdapter {
  private readonly database: () => Promise<Database>;

  constructor(options: MySQLAdapterOptions = {}) {
    this.database = options.database ?? getDb;
  }

  private table(name: string): AnyMySqlTable {
    const t = TABLES[name];
    if (!t) throw new Error(`Unknown collection: ${name}`);
    return t;
  }

  private column(table: AnyMySqlTable, name: string): AnyMySqlColumn {
    const column = (getTableColumns(table) as Record<string, AnyMySqlColumn>)[name];
    if (!column) throw new Error(`Unknown field: ${name}`);
    return column;
  }

  async save<T>(
    collection: string,
    id: string,
    data: T
  ): Promise<void> {
    const db = await this.database();
    const t = this.table(collection);
    const pk = storagePrimaryKeyField(collection);

    // Build insert object with the correct primary key name
    const record: Record<string, unknown> = { ...(data as object), [pk]: id };

    // Fill missing required columns that exist in MySQL but may not be in the DTO
    this.fillRequired(collection, record);

    const serialized = this.serializeRecord(collection, record);
    await db.insert(t).values(serialized).onDuplicateKeyUpdate({ set: serialized });
  }

  /** Ensure required columns have values for INSERT. */
  private static REQUIRED_DEFAULTS: Record<string, Record<string, unknown>> = {
    folders: { user_id: "default" },
    memories: { user_id: "default" },
    sessions: { user_id: "default" },
    messages: { user_id: "default" },
    connections: { user_id: "default" },
    files: { user_id: "default" },
    file_contents: { user_id: "default" },
  };

  private fillRequired(collection: string, record: Record<string, unknown>): void {
    const defaults = MySQLAdapter.REQUIRED_DEFAULTS[collection];
    if (!defaults) return;
    for (const [key, val] of Object.entries(defaults)) {
      if (!(key in record) || record[key] === undefined || record[key] === null) {
        record[key] = val;
      }
    }
  }

  async read<T>(collection: string, id: string): Promise<T | null> {
    const db = await this.database();
    const t = this.table(collection);
    const pk = storagePrimaryKeyField(collection);

    const rows = await db
      .select()
      .from(t)
      .where(eq(this.column(t, pk), id))
      .limit(1);

    if (!rows.length) return null;
    return this.deserializeRecord(collection, rows[0]) as unknown as T;
  }

  async readAll<T>(collection: string): Promise<T[]> {
    const db = await this.database();
    const t = this.table(collection);
    const rows = await db.select().from(t);
    return rows.map((r: Record<string, unknown>) => this.deserializeRecord(collection, r)) as unknown as T[];
  }

  async delete(collection: string, id: string): Promise<void> {
    const db = await this.database();
    const t = this.table(collection);
    const pk = storagePrimaryKeyField(collection);
    await db.delete(t).where(eq(this.column(t, pk), id));
  }

  async queryByField<T>(
    collection: string,
    field: string,
    value: string
  ): Promise<T[]> {
    const db = await this.database();
    const t = this.table(collection);

    const rows = await db
      .select()
      .from(t)
      .where(eq(this.column(t, field), value));

    return rows.map((r: Record<string, unknown>) => this.deserializeRecord(collection, r)) as unknown as T[];
  }

  async query<T>(
    collection: string,
    predicate: (item: T) => boolean
  ): Promise<T[]> {
    // Fallback: read all and filter locally
    const all = await this.readAll<T>(collection);
    return all.filter(predicate);
  }

  async clear(collection: string): Promise<void> {
    const db = await this.database();
    const t = this.table(collection);
    await db.delete(t);
  }

  async exportAll(): Promise<Record<string, unknown[]>> {
    const result: Record<string, unknown[]> = {};
    for (const name of Object.keys(TABLES)) {
      result[name] = await this.readAll(name);
    }
    return result;
  }

  async importAll(data: Record<string, unknown[]>): Promise<void> {
    const db = await this.database();
    const entries = Object.entries(data);
    for (const [collection, items] of entries) {
      this.table(collection);
      for (const item of items) storageRecordId(collection, item);
    }

    await db.transaction(async (transaction) => {
      for (const [collection, items] of entries) {
        const table = this.table(collection);
        await transaction.delete(table);
        for (const item of items) {
          const record = { ...(item as Record<string, unknown>) };
          record[storagePrimaryKeyField(collection)] = storageRecordId(collection, item);
          this.fillRequired(collection, record);
          const serialized = this.serializeRecord(collection, record);
          await transaction.insert(table).values(serialized);
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Value normalization helpers                                        */
  /* ------------------------------------------------------------------ */

  /** Convert ISO 8601 timestamp strings to MySQL datetime format. */
  private static ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

  private toMySqlDatetime(value: string): string {
    if (MySQLAdapter.ISO_RE.test(value)) {
      return value.replace("T", " ").replace("Z", "").substring(0, 19);
    }
    return value;
  }

  /* ------------------------------------------------------------------ */
  /*  JSON serialization helpers                                         */
  /* ------------------------------------------------------------------ */

  /** Fields that should be stored as JSON strings in MySQL json columns. */
  private static JSON_FIELDS: Record<string, Set<string>> = {
    memories: new Set(["embedding", "position", "metadata", "keywords"]),
    messages: new Set(["citations"]),
    connections: new Set(["spatial_path", "metadata"]),
    settings: new Set(["value"]),
    file_contents: new Set(["chunks"]),
  };

  private static DATETIME_FIELDS: Record<string, Set<string>> = {
    folders: new Set(["created_at", "updated_at"]),
    memories: new Set(["created_at", "updated_at"]),
    sessions: new Set(["created_at", "updated_at"]),
    messages: new Set(["created_at"]),
    connections: new Set(["created_at"]),
    files: new Set(["created_at"]),
    file_contents: new Set(["extracted_at"]),
  };

  private serializeRecord(collection: string, record: Record<string, unknown>): Record<string, unknown> {
    const jsonFields = MySQLAdapter.JSON_FIELDS[collection];
    const datetimeFields = MySQLAdapter.DATETIME_FIELDS[collection];
    const columns = getTableColumns(this.table(collection)) as Record<string, AnyMySqlColumn>;
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(record)) {
      if (!(key in columns)) continue;
      let val = record[key];

      // Convert ISO 8601 timestamps to MySQL datetime format
      if (datetimeFields?.has(key) && typeof val === "string") {
        val = this.toMySqlDatetime(val);
      }

      // Serialize object/array values to JSON strings for MySQL json columns
      if (jsonFields?.has(key) && val !== null && val !== undefined && typeof val !== "string") {
        val = JSON.stringify(val);
      }

      out[key] = val;
    }
    return out;
  }

  /** Regex for MySQL datetime format: YYYY-MM-DD HH:MM:SS */
  private static MYSQL_DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

  private deserializeRecord(collection: string, record: Record<string, unknown>): Record<string, unknown> {
    const jsonFields = MySQLAdapter.JSON_FIELDS[collection];
    const datetimeFields = MySQLAdapter.DATETIME_FIELDS[collection];
    const out: Record<string, unknown> = {};

    for (const key of Object.keys(record)) {
      let val = record[key];

      // Convert MySQL datetime back to ISO 8601
      if (datetimeFields?.has(key) && typeof val === "string" && MySQLAdapter.MYSQL_DT_RE.test(val)) {
        val = val + ".000Z"; // MySQL datetime → ISO 8601
        val = (val as string).replace(" ", "T");
      }

      // Parse JSON strings back to objects
      if (jsonFields?.has(key) && typeof val === "string") {
        try {
          val = JSON.parse(val);
        } catch {
          // keep as string if parse fails
        }
      }

      out[key] = val;
    }
    return out;
  }
}
