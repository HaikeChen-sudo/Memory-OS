/**
 * analyzeVideoLink — video analysis orchestration (client-side).
 *
 * Called AFTER a video_link memory is saved. Runs async, does not block UI.
 * Calls /api/video/analyze, persists the returned text, updates parse_status.
 *
 * Mirrors parseFile.ts pattern:
 *   1. Call API → get analysis text
 *   2. chunkText → saveFileContent
 *   3. Update parse_status → done (or error)
 *   4. Dispatch ocr-complete event → UI refreshes
 */

import { storage } from "@/storage";
import { chunkText } from "@/services/parser/chunk-text";
import type { FileRecord, ParseStatus } from "@/types";

const MAX_VIDEO_CHARS = 8000;

export async function analyzeVideoLink(
  url: string,
  fileRecord: FileRecord
): Promise<void> {
  try {
    await updateStatus(fileRecord, "parsing");

    let extractedText: string | null = null;
    let apiError: string | null = null;

    try {
      const response = await fetch("/api/video/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.text && typeof result.text === "string") {
          extractedText = result.text;
        }
      } else {
        const rawBody = await response.text();
        let errBody: unknown = {};
        try { errBody = JSON.parse(rawBody); } catch { errBody = { raw: rawBody.slice(0, 500) }; }
        apiError =
          (errBody as { error?: string }).error ||
          `HTTP ${response.status}`;
        console.error(
          `视频分析 API 错误 (${fileRecord.original_name}): HTTP ${response.status}`,
          errBody
        );
      }
    } catch (fetchErr) {
      apiError = fetchErr instanceof Error ? fetchErr.message : "网络请求失败";
      console.error(
        `视频分析请求失败 (${fileRecord.original_name}):`,
        apiError
      );
    }

    if (!extractedText) {
      // Save error message so UI can show it
      if (apiError) {
        await storage.saveFileContent({
          file_id: fileRecord.id,
          extracted_text: `分析失败: ${apiError}`,
          chunks: [],
          extracted_at: new Date().toISOString(),
        });
        await updateStatus(fileRecord, "error");
      } else {
        console.log(
          `视频分析完成: ${fileRecord.original_name} (未提取到内容)`
        );
        await updateStatus(fileRecord, "done");
      }
      return;
    }

    // Truncate
    if (extractedText.length > MAX_VIDEO_CHARS) {
      extractedText = extractedText.slice(0, MAX_VIDEO_CHARS);
    }

    const chunks = chunkText(extractedText);
    await storage.saveFileContent({
      file_id: fileRecord.id,
      extracted_text: extractedText,
      chunks,
      extracted_at: new Date().toISOString(),
    });

    // ★ CRITICAL: Update memory.content with extracted text
    // Guard: only overwrite if content is still the placeholder (URL or empty).
    // If the user has manually edited the content while analysis ran, preserve their edit.
    try {
      const memory = await storage.readMemory(fileRecord.memory_id);
      if (memory) {
        const isPlaceholder =
          memory.content === url ||                        // the video URL itself
          memory.content.startsWith("video:") ||           // video:filename placeholder
          memory.content.length === 0;                     // empty
        if (isPlaceholder) {
          memory.content = extractedText;
          memory.updated_at = new Date().toISOString();
          await storage.saveMemory(memory);
        }
      }
    } catch (err) {
      console.error("Failed to update memory content with video text:", err);
    }

    console.log(
      `视频分析完成: ${fileRecord.original_name} (${extractedText.length} 字符, ${chunks.length} 分块)`
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
    console.error(`视频分析失败 ${fileRecord.id}:`, err);
    await updateStatus(fileRecord, "error");
  }
}

async function updateStatus(
  fileRecord: FileRecord,
  status: ParseStatus
): Promise<void> {
  const updated = { ...fileRecord, parse_status: status };
  await storage.saveFile(updated);

  // Touch memory.updated_at
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
