import type { StorageAdapter } from "./types";
import type { Memory, Session, Message, FileRecord, FileContent, Folder } from "@/types";
import { COLLECTIONS } from "./types";

/**
 * High-level storage API for memories, sessions, and messages.
 *
 * Business layer calls these methods — never the adapter directly.
 * All data stays local (IndexedDB) by default. Cloud sync is a future option.
 *
 * Folder isolation: setCurrentFolder(folderId) scopes all read-all operations.
 */
export class MemoryStorage {
  private currentFolderId: string | null = null;

  constructor(private adapter: StorageAdapter) {}

  /** Set the active folder context for scoped reads. */
  setCurrentFolder(folderId: string | null): void {
    this.currentFolderId = folderId;
    this.fileContentCache.clear();
  }

  getCurrentFolder(): string | null {
    return this.currentFolderId;
  }

  /* ------------------------------------------------------------------ */
  /*  Folders                                                            */
  /* ------------------------------------------------------------------ */

  async saveFolder(folder: Folder): Promise<void> {
    await this.adapter.save(COLLECTIONS.FOLDERS, folder.id, folder);
  }

  async readAllFolders(): Promise<Folder[]> {
    const folders = await this.adapter.readAll<Folder>(COLLECTIONS.FOLDERS);
    return folders.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  async deleteFolder(id: string): Promise<void> {
    await this.adapter.delete(COLLECTIONS.FOLDERS, id);
  }

  /* ------------------------------------------------------------------ */
  /*  Memories                                                           */
  /* ------------------------------------------------------------------ */

  async saveMemory(memory: Memory): Promise<void> {
    await this.adapter.save(COLLECTIONS.MEMORIES, memory.id, memory);
  }

  async readMemory(id: string): Promise<Memory | null> {
    return this.adapter.read<Memory>(COLLECTIONS.MEMORIES, id);
  }

  async readAllMemories(folderId?: string): Promise<Memory[]> {
    const fid = folderId ?? this.currentFolderId;
    if (!fid) return this.adapter.readAll<Memory>(COLLECTIONS.MEMORIES);
    if (this.adapter.queryByField) {
      return this.adapter.queryByField<Memory>(COLLECTIONS.MEMORIES, "folder_id", fid);
    }
    return this.adapter.query<Memory>(COLLECTIONS.MEMORIES, (m) => m.folder_id === fid);
  }

  async deleteMemory(id: string): Promise<void> {
    await this.adapter.delete(COLLECTIONS.MEMORIES, id);
  }

  /* ------------------------------------------------------------------ */
  /*  Sessions                                                           */
  /* ------------------------------------------------------------------ */

  async saveSession(session: Session): Promise<void> {
    await this.adapter.save(COLLECTIONS.SESSIONS, session.id, session);
  }

  async readSession(id: string): Promise<Session | null> {
    return this.adapter.read<Session>(COLLECTIONS.SESSIONS, id);
  }

  async readAllSessions(folderId?: string): Promise<Session[]> {
    const fid = folderId ?? this.currentFolderId;
    let sessions: Session[];
    if (!fid) {
      sessions = await this.adapter.readAll<Session>(COLLECTIONS.SESSIONS);
    } else if (this.adapter.queryByField) {
      sessions = await this.adapter.queryByField<Session>(COLLECTIONS.SESSIONS, "folder_id", fid);
    } else {
      sessions = await this.adapter.query<Session>(COLLECTIONS.SESSIONS, (s) => s.folder_id === fid);
    }
    return sessions.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Messages                                                           */
  /* ------------------------------------------------------------------ */

  async saveMessage(message: Message): Promise<void> {
    await this.adapter.save(COLLECTIONS.MESSAGES, message.id, message);
  }

  async readMessagesBySession(sessionId: string): Promise<Message[]> {
    let messages: Message[];
    if (this.adapter.queryByField) {
      messages = await this.adapter.queryByField<Message>(COLLECTIONS.MESSAGES, "session_id", sessionId);
    } else {
      messages = await this.adapter.query<Message>(
        COLLECTIONS.MESSAGES,
        (message) => message.session_id === sessionId
      );
    }
    return [...messages].sort(
      (left, right) =>
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
        || left.id.localeCompare(right.id)
    );
  }

  /* ------------------------------------------------------------------ */
  /*  Export / Import                                                    */
  /* ------------------------------------------------------------------ */

  async exportAll(): Promise<Record<string, unknown[]>> {
    return this.adapter.exportAll();
  }

  async importAll(data: Record<string, unknown[]>): Promise<void> {
    await this.adapter.importAll(data);
  }

  /* ── Files ── */

  async saveFile(file: FileRecord): Promise<void> {
    await this.adapter.save(COLLECTIONS.FILES, file.id, file);
  }

  async readFile(id: string): Promise<FileRecord | null> {
    return this.adapter.read<FileRecord>(COLLECTIONS.FILES, id);
  }

  async readAllFiles(): Promise<FileRecord[]> {
    return this.adapter.readAll<FileRecord>(COLLECTIONS.FILES);
  }

  async deleteFile(id: string): Promise<void> {
    await this.adapter.delete(COLLECTIONS.FILES, id);
  }

  async getFileByMemoryId(memoryId: string): Promise<FileRecord | null> {
    let files: FileRecord[];
    if (this.adapter.queryByField) {
      files = await this.adapter.queryByField<FileRecord>(COLLECTIONS.FILES, "memory_id", memoryId);
    } else {
      files = await this.adapter.query<FileRecord>(
        COLLECTIONS.FILES,
        (f) => f.memory_id === memoryId
      );
    }
    return files[0] ?? null;
  }

  /* ── File Contents ── */

  private fileContentCache = new Map<string, FileContent | null>();

  async saveFileContent(content: FileContent): Promise<void> {
    this.fileContentCache.set(content.file_id, content);
    await this.adapter.save(COLLECTIONS.FILE_CONTENTS, content.file_id, content);
  }

  async readFileContent(fileId: string): Promise<FileContent | null> {
    if (this.fileContentCache.has(fileId)) {
      return this.fileContentCache.get(fileId) ?? null;
    }
    const result = await this.adapter.read<FileContent>(COLLECTIONS.FILE_CONTENTS, fileId);
    this.fileContentCache.set(fileId, result);
    return result;
  }

  async deleteFileContent(fileId: string): Promise<void> {
    this.fileContentCache.delete(fileId);
    await this.adapter.delete(COLLECTIONS.FILE_CONTENTS, fileId);
  }
}
