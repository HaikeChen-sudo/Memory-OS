/**
 * parseFile — file analysis orchestration.
 *
 * Called AFTER memory is saved. Runs async, does not block the UI.
 * Updates parse_status: pending → parsing → done (or error).
 *
 * All image/PDF text extraction goes through doubao-seed-1-6-vision-250815
 * via /api/ocr. The frontend sends the original file as base64 without
 * any compression or preprocessing — the model handles everything.
 */

import { storage } from "@/storage";
import { chunkText } from "@/services/parser/chunk-text";
import type { FileRecord, ParseStatus } from "@/types";

const MAX_IMAGE_CHARS = 3000;
const MAX_PDF_CHARS = 10000;

export async function parseFile(
  file: File,
  fileRecord: FileRecord
): Promise<void> {
  try {
    await updateStatus(fileRecord, "parsing");

    const base64DataUrl = await fileToBase64DataURL(file);
    if (!base64DataUrl) {
      console.error(`无法读取文件: ${fileRecord.original_name}`);
      await updateStatus(fileRecord, "error");
      return;
    }

    let extractedText: string | null = null;

    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64DataUrl,
          type: fileRecord.type,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.text && typeof result.text === "string") {
          extractedText = result.text;
        }
      } else {
        console.error(
          `OCR API 错误 (${fileRecord.original_name}): HTTP ${response.status}`
        );
      }
    } catch (fetchErr) {
      console.error(
        `OCR 请求失败 (${fileRecord.original_name}):`,
        fetchErr instanceof Error ? fetchErr.message : fetchErr
      );
    }

    if (!extractedText) {
      console.log(
        `解析完成: ${fileRecord.original_name} (未识别到文字)`
      );
      await updateStatus(fileRecord, "done");
      return;
    }

    // Truncate based on file type
    const maxChars =
      fileRecord.type === "pdf" ? MAX_PDF_CHARS : MAX_IMAGE_CHARS;
    if (extractedText.length > maxChars) {
      extractedText = extractedText.slice(0, maxChars);
    }

    const chunks = chunkText(extractedText);
    await storage.saveFileContent({
      file_id: fileRecord.id,
      extracted_text: extractedText,
      chunks,
      extracted_at: new Date().toISOString(),
    });

    // ★ CRITICAL: Update memory.content with extracted text
    // Without this, image memories store base64, PDF memories store "pdf:filename"
    // The AI would never see the actual text content
    //
    // Guard: only overwrite if content is still the placeholder value.
    // If the user has manually edited the content while parsing ran, preserve their edit.
    try {
      const memory = await storage.readMemory(fileRecord.memory_id);
      if (memory) {
        const isPlaceholder =
          memory.content.startsWith("data:") ||           // base64 image
          memory.content.startsWith("pdf:") ||            // PDF placeholder
          memory.content.length === 0;                     // empty
        if (isPlaceholder) {
          memory.content = extractedText;
          memory.updated_at = new Date().toISOString();
          await storage.saveMemory(memory);
        }
      }
    } catch (err) {
      console.error("Failed to update memory content with OCR text:", err);
    }

    console.log(
      `解析完成: ${fileRecord.original_name} (${extractedText.length} 字符, ${chunks.length} 分块)`
    );
    await updateStatus(fileRecord, "done");

    // Fire-and-forget: generate AI keywords + summary
    import("@/features/enrichment/generateMetadata")
      .then(({ generateMemoryMetadata }) =>
        generateMemoryMetadata(fileRecord.memory_id, extractedText)
      )
      .catch((err) =>
        console.error("Metadata generation failed:", err)
      );
  } catch (err) {
    console.error(`Parse failed for file ${fileRecord.id}:`, err);
    await updateStatus(fileRecord, "error");
  }
}

async function updateStatus(
  fileRecord: FileRecord,
  status: ParseStatus
): Promise<void> {
  const updated = { ...fileRecord, parse_status: status };
  await storage.saveFile(updated);

  // Touch memory.updated_at and notify UI via event (no store dependency)
  try {
    const memory = await storage.readMemory(fileRecord.memory_id);
    if (memory) {
      memory.updated_at = new Date().toISOString();
      await storage.saveMemory(memory);
    }
  } catch {
    // Best-effort
  }

  // Direct event to the matching MemoryCard — no re-render chain needed
  window.dispatchEvent(
    new CustomEvent("ocr-complete", {
      detail: { memoryId: fileRecord.memory_id, fileId: fileRecord.id },
    })
  );
}

/**
 * Read a File as a base64 data URL.
 * No compression or preprocessing — the original file is sent as-is.
 */
function fileToBase64DataURL(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        resolve(null);
      }
    };
    reader.onerror = () => {
      console.error(`FileReader error for ${file.name}`);
      resolve(null);
    };
    reader.readAsDataURL(file);
  });
}
