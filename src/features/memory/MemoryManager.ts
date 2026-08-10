import { storage } from "@/storage";
import type { Memory, MemoryCreateInput, MemoryType, TimeLayer, FileRecord } from "@/types";
import {
  recordMemoryCreated,
  recordMemoryDeleted,
  recordMemoryUpdated,
} from "@/features/ledger/recordMemoryEvent";
import { MemoryProjectionService } from "@/features/ledger/memoryProjection";
import { eventLedger } from "@/ledger";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_PARSE_CONCURRENCY = 2;
const MAX_TEXT_CHARS = 3000;
const memoryProjector = new MemoryProjectionService(eventLedger, storage);

/**
 * MemoryManager — handles all memory CRUD.
 *
 * Uses storage (abstract) — never touches IndexedDB or Supabase directly.
 * Compression, preview generation, and dedup happen here.
 */
export class MemoryManager {
  private activeParseJobs = 0;
  private parseQueue: Array<() => void> = [];

  /* ── Create ── */

  async create(input: MemoryCreateInput): Promise<Memory> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    this.validateInput(input);

    const content = await this.processContent(input);

    const memory: Memory = {
      id,
      folder_id: input.folder_id,
      type: input.type,
      title: input.title,
      content,
      created_at: now,
      updated_at: now,
      source_id: input.source_id || null,
      source_url: input.source_url || null,
      summary: null,
      preview: input.preview || null,
      time_layer: computeTimeLayer(now),
      embedding: null,
      position: null,
      color: "#3b82f6",
      animation_state: "idle",
      keywords: null,
      metadata: {},
    };
    let pendingFileRecord: FileRecord | null = null;
    let pendingFile: File | null = null;
    let pendingVideoUrl: string | null = null;

    // For image/pdf files: create FileRecord and trigger background parsing
    if (input.file && (input.type === "image" || input.type === "pdf")) {
      const fileId = crypto.randomUUID();
      memory.metadata.file_id = fileId;

      pendingFileRecord = {
        id: fileId,
        memory_id: id,
        folder_id: input.folder_id,
        type: input.type as "image" | "pdf",
        original_name: input.file.name,
        parse_status: "pending",
        created_at: now,
      };
      pendingFile = input.file;
    }

    // For video_link: create FileRecord and trigger background video analysis
    if (input.type === "video_link" && input.source_url) {
      const fileId = crypto.randomUUID();
      memory.metadata.file_id = fileId;

      pendingFileRecord = {
        id: fileId,
        memory_id: id,
        folder_id: input.folder_id,
        type: "video",
        original_name: input.title || input.source_url,
        parse_status: "pending",
        created_at: now,
      };
      pendingVideoUrl = input.source_url;
    }

    await recordMemoryCreated(memory);
    await memoryProjector.reconcile(memory.id);
    if (pendingFileRecord) {
      await storage.saveFile(pendingFileRecord);
      if (pendingFile) this.scheduleParse(pendingFile, pendingFileRecord);
      if (pendingVideoUrl) this.scheduleVideoAnalysis(pendingVideoUrl, pendingFileRecord);
    }
    return memory;
  }

  private validateInput(input: MemoryCreateInput): void {
    if (input.file) {
      const sizeMB = (input.file.size / 1024 / 1024).toFixed(1);
      const name = input.file.name;
      if (input.type === "image" && input.file.size > MAX_IMAGE_BYTES) {
        throw new Error(`图片文件超过 20MB 限制: ${name} (${sizeMB}MB)`);
      }
      if (input.type === "pdf" && input.file.size > MAX_PDF_BYTES) {
        throw new Error(`PDF 文件超过 50MB 限制: ${name} (${sizeMB}MB)`);
      }
      if (input.type === "audio_link" && input.file.size > MAX_AUDIO_BYTES) {
        throw new Error(`音频文件超过 10MB 限制: ${name} (${sizeMB}MB)`);
      }
    }
  }

  /* ── Update ── */

  async update(id: string, updates: Partial<Memory>): Promise<Memory | null> {
    const memory = await memoryProjector.reconcile(id);
    if (!memory) return null;
    const updated: Memory = { ...memory, ...updates, id, updated_at: new Date().toISOString() };
    await recordMemoryUpdated({ before: memory, after: updated, changes: updates });
    await memoryProjector.reconcile(id);
    return updated;
  }

  /* ── Read ── */

  async getAll(type?: MemoryType, folderId?: string): Promise<Memory[]> {
    await memoryProjector.reconcileAll(folderId);
    const all = await storage.readAllMemories(folderId);
    const sorted = all.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (type) return sorted.filter((m) => m.type === type);
    return sorted;
  }

  async getById(id: string): Promise<Memory | null> {
    return memoryProjector.reconcile(id);
  }

  /* ── Delete ── */

  async delete(id: string): Promise<void> {
    const memory = await memoryProjector.reconcile(id);
    if (memory) await recordMemoryDeleted(memory);

    // Cascade-delete associated file and file_contents
    try {
      const file = await storage.getFileByMemoryId(id);
      if (file) {
        await storage.deleteFileContent(file.id);
        await storage.deleteFile(file.id);
      }
    } catch {
      // File cleanup is best-effort
    }
    await memoryProjector.reconcile(id);
  }

  /* ── Content processing ── */

  private async processContent(input: MemoryCreateInput): Promise<string> {
    if (input.file) {
      if (input.type === "image") {
        return await this.compressImage(input.file);
      }
      if (input.type === "pdf") {
        return `pdf:${input.file.name}`;
      }
      if (input.type === "audio_link") {
        return this.processAudio(input.file);
      }
      if (input.type === "video_link") {
        return input.content || `video:${input.file.name}`;
      }
      return input.content || input.file.name;
    }
    return input.content.length > MAX_TEXT_CHARS
      ? input.content.slice(0, MAX_TEXT_CHARS)
      : input.content;
  }

  private scheduleParse(file: File, fileRecord: FileRecord): void {
    const run = () => {
      this.activeParseJobs++;
      import("@/features/parsing/parseFile").then(({ parseFile }) => {
        parseFile(file, fileRecord).finally(() => {
          this.activeParseJobs--;
          this.dequeueNext();
        });
      });
    };

    if (this.activeParseJobs < MAX_PARSE_CONCURRENCY) {
      run();
    } else {
      this.parseQueue.push(run);
    }
  }

  private scheduleVideoAnalysis(url: string, fileRecord: FileRecord): void {
    const run = () => {
      this.activeParseJobs++;
      import("@/features/parsing/analyzeVideo")
        .then(({ analyzeVideoLink }) => {
          return analyzeVideoLink(url, fileRecord);
        })
        .catch((err) => {
          console.error("scheduleVideoAnalysis 失败:", err);
        })
        .finally(() => {
          this.activeParseJobs--;
          this.dequeueNext();
        });
    };

    if (this.activeParseJobs < MAX_PARSE_CONCURRENCY) {
      run();
    } else {
      this.parseQueue.push(run);
    }
  }

  private dequeueNext(): void {
    if (this.parseQueue.length > 0 && this.activeParseJobs < MAX_PARSE_CONCURRENCY) {
      const next = this.parseQueue.shift();
      if (next) next();
    }
  }

  private async compressImage(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxW = 1200;
          const maxH = 1200;
          let { width, height } = img;
          if (width > maxW || height > maxH) {
            const ratio = Math.min(maxW / width, maxH / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, width, height);
          // Always use JPEG for storage — PNG base64 can exceed API body limits
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => {
          // Fallback: store file name if image can't be decoded
          resolve(`[图片: ${file.name}]`);
        };
        img.src = reader.result as string;
      };
      reader.onerror = () => {
        resolve(`[图片: ${file.name}]`);
      };
      reader.readAsDataURL(file);
    });
  }

  private processAudio(file: File): string {
    return `audio:${file.name}`;
  }

  /* ── Export / Import ── */

  async exportAll(): Promise<Record<string, unknown[]>> {
    return storage.exportAll();
  }

  async importAll(data: Record<string, unknown[]>): Promise<void> {
    await storage.importAll(data);
  }
}

function computeTimeLayer(isoString: string): TimeLayer {
  const now = new Date();
  const date = new Date(isoString);
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return "this_week";
  if (diffDays < 30) return "this_month";
  if (diffDays < 365) return "this_year";
  return "older";
}

export const memoryManager = new MemoryManager();
