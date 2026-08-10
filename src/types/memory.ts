export type MemoryType =
  | "image"
  | "pdf"
  | "text"
  | "video_link"
  | "audio_link"
  | "web_link"
  | "note";

export type TimeLayer =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "this_year"
  | "older";

/**
 * Unified Memory object.
 *
 * Core fields: id, type, content, time, source
 * Reserved fields (future): embedding, position, color, animation_state
 */
export interface Memory {
  /* ── Core ── */
  id: string;
  folder_id: string;
  type: MemoryType;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;

  /* ── Source tracking ── */
  source_id: string | null;
  source_url: string | null;

  /* ── Display ── */
  summary: string | null;
  preview: string | null;
  time_layer: TimeLayer;

  /* ── Reserved — future ── */
  embedding: number[] | null;
  position: { x: number; y: number; z: number } | null;
  color: string;
  animation_state: string;

  /* ── AI enrichment ── */
  keywords: string[] | null;

  /* ── Extensible ── */
  metadata: Record<string, unknown>;
}

export interface MemoryCreateInput {
  folder_id: string;
  type: MemoryType;
  title: string;
  content: string;
  source_id?: string;
  source_url?: string;
  file?: File;
  preview?: string;
}

export interface TimeGroup {
  layer: TimeLayer;
  label: string;
  memories: Memory[];
}

/* ── File Analysis ── */

export type ParseStatus = "pending" | "parsing" | "done" | "error";

export interface FileRecord {
  id: string;
  memory_id: string;
  folder_id: string;
  type: "image" | "pdf" | "video";
  original_name: string;
  parse_status: ParseStatus;
  created_at: string;
}

export interface FileContent {
  file_id: string;
  extracted_text: string;
  chunks: string[];
  extracted_at: string;
}
