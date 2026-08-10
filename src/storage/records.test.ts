import assert from "node:assert/strict";
import test from "node:test";
import { storageRecordId } from "./types";

test("uses file_id as the portable key for file contents", () => {
  assert.equal(storageRecordId("file_contents", { file_id: "file-1" }), "file-1");
});
