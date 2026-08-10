import { NextRequest, NextResponse } from "next/server";
import { MySQLAdapter } from "@/storage/MySQLAdapter";

export const maxDuration = 30; // 30s timeout for large payloads

const adapter = new MySQLAdapter();

/**
 * Allowed collections — whitelist to prevent arbitrary table access.
 * Must match the TABLES map in MySQLAdapter and COLLECTIONS in storage/types.ts.
 */
const ALLOWED_COLLECTIONS = new Set([
  "folders",
  "memories",
  "sessions",
  "messages",
  "connections",
  "settings",
  "files",
  "file_contents",
]);

/** Maximum payload size for save/importAll (1MB) */
const MAX_PAYLOAD_BYTES = 1_048_576;

interface StorageRequest {
  action:
    | "save"
    | "read"
    | "readAll"
    | "delete"
    | "queryByField"
    | "clear"
    | "exportAll"
    | "importAll";
  collection?: string;
  id?: string;
  data?: unknown;
  field?: string;
  value?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Payload size check
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return err(`Payload too large: ${contentLength} bytes (max ${MAX_PAYLOAD_BYTES})`, 413);
    }

    const body: StorageRequest = await request.json();
    const { action, collection, id, data, field, value } = body;

    // Collection whitelist check (skip for exportAll which reads all)
    if (collection && !ALLOWED_COLLECTIONS.has(collection)) {
      return err(`Unknown collection: ${collection}`);
    }

    switch (action) {
      case "save": {
        if (!collection || !id || data === undefined) {
          return err("save requires collection, id, data");
        }
        if (id.length > 64) return err("id too long (max 64 chars)");
        await adapter.save(collection, id, data as { id: string });
        return ok(null);
      }

      case "read": {
        if (!collection || !id) return err("read requires collection, id");
        if (id.length > 64) return err("id too long (max 64 chars)");
        const result = await adapter.read(collection, id);
        return ok(result);
      }

      case "readAll": {
        if (!collection) return err("readAll requires collection");
        const result = await adapter.readAll(collection);
        return ok(result);
      }

      case "delete": {
        if (!collection || !id) return err("delete requires collection, id");
        if (id.length > 64) return err("id too long (max 64 chars)");
        await adapter.delete(collection, id);
        return ok(null);
      }

      case "queryByField": {
        if (!collection || !field || value === undefined) {
          return err("queryByField requires collection, field, value");
        }
        if (typeof value !== "string" || value.length > 500) {
          return err("value must be a string (max 500 chars)");
        }
        const result = await adapter.queryByField(collection, field, value);
        return ok(result);
      }

      case "clear": {
        if (!collection) return err("clear requires collection");
        await adapter.clear(collection);
        return ok(null);
      }

      case "exportAll": {
        const result = await adapter.exportAll();
        return ok(result);
      }

      case "importAll": {
        if (!body.data) return err("importAll requires data");
        if (typeof body.data !== "object" || Array.isArray(body.data)) {
          return err("importAll data must be a Record<string, unknown[]>");
        }
        const dataObj = body.data as Record<string, unknown[]>;
        for (const key of Object.keys(dataObj)) {
          if (!ALLOWED_COLLECTIONS.has(key)) {
            return err(`Unknown collection in import: ${key}`);
          }
        }
        await adapter.importAll(dataObj);
        return ok(null);
      }

      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Storage API error";
    const cause = error instanceof Error && (error as Error & { cause?: Error }).cause;
    console.error("Storage API error:", error);
    console.error("Underlying cause:", cause);
    return NextResponse.json(
      { error: cause ? `${msg} | cause: ${cause.message}` : msg },
      { status: 500 }
    );
  }
}

function ok<T>(data: T) {
  return NextResponse.json({ data });
}

function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
