import assert from "node:assert/strict";
import test from "node:test";
import type { Session } from "../../types";
import { sessionIdForFolder } from "./sessionScope";

const session: Session = {
  id: "chat-a",
  folder_id: "folder-a",
  title: "A",
  color: "#000000",
  animation_state: "idle",
  created_at: "2026-08-10T00:00:00.000Z",
  updated_at: "2026-08-10T00:00:00.000Z",
};

test("rejects a persisted chat from another folder", () => {
  assert.equal(sessionIdForFolder(session, "folder-b"), null);
  assert.equal(sessionIdForFolder(session, "folder-a"), "chat-a");
});
