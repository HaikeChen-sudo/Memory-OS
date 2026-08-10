import assert from "node:assert/strict";
import test from "node:test";
import { stableSerialize } from "./contentHash";

test("rejects non-JSON objects instead of hashing them like empty objects", () => {
  assert.throws(() => stableSerialize(new Date(0)), /plain JSON objects/);
  assert.equal(stableSerialize({}), "{}");
});
