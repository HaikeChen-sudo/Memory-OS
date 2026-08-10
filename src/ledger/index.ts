import { EventLedger } from "./EventLedger";
import { InMemoryLedgerAdapter } from "./InMemoryLedgerAdapter";
import { IndexedDBLedgerAdapter } from "./IndexedDBLedgerAdapter";

export type {
  AppendEventInput,
  ContentObjectInput,
  ContentObjectRef,
  EventEnvelope,
  EventLedgerAdapter,
  LedgerEventType,
  StoredContentObject,
} from "./types";
export { EventLedger } from "./EventLedger";
export { InMemoryLedgerAdapter } from "./InMemoryLedgerAdapter";
export { IndexedDBLedgerAdapter } from "./IndexedDBLedgerAdapter";

const adapter = typeof indexedDB === "undefined"
  ? new InMemoryLedgerAdapter()
  : new IndexedDBLedgerAdapter();

export const eventLedger = new EventLedger(adapter);
