/** Returns a lowercase SHA-256 digest for text encoded as UTF-8. */
export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Serializes JSON-like data with stable object-key ordering for hashing. */
export function stableSerialize(value: unknown): string {
  const seen = new WeakSet<object>();
  return serialize(value, seen);
}

function serialize(value: unknown, seen: WeakSet<object>): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Ledger payload numbers must be finite");
    return JSON.stringify(value);
  }
  if (typeof value === "undefined") return "null";
  if (typeof value !== "object") throw new TypeError(`Ledger payload cannot contain ${typeof value}`);
  if (seen.has(value)) throw new TypeError("Ledger payload cannot contain circular references");

  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => serialize(item, seen)).join(",")}]`;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Ledger payload objects must be plain JSON objects");
    }
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${serialize(record[key], seen)}`);
    return `{${fields.join(",")}}`;
  } finally {
    seen.delete(value);
  }
}
