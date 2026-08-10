"use client";

import { useState, useEffect } from "react";
import type { Memory } from "@/types";
import { TypeIcon } from "@/components/shared/TypeIcon";
import { useMemoryStore } from "@/stores/memoryStore";

interface MemoryCardProps {
  memory: Memory;
}

export function MemoryCard({ memory }: MemoryCardProps) {
  const { selectedMemoryId, selectMemory } = useMemoryStore();
  const isSelected = selectedMemoryId === memory.id;

  // Load file_contents for image/pdf memories to show OCR/extracted text
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<string | null>(null);

  useEffect(() => {
    const fileId = memory.metadata?.file_id as string | undefined;
    if (!fileId) return;
    if (memory.type !== "image" && memory.type !== "pdf" && memory.type !== "video_link") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const MAX_POLLS = 10;
    const POLL_INTERVAL = 2000;

    async function load() {
      if (cancelled) return;

      try {
        const { storage } = await import("@/storage");

        const file = await storage.readFile(fileId!);
        if (cancelled) return;
        const status = file?.parse_status || null;
        setParseStatus(status);

        const fc = await storage.readFileContent(fileId!);
        if (cancelled) return;
        setExtractedText(fc?.extracted_text || null);

        // Keep polling while parsing is in progress
        if ((status === "parsing" || status === "pending") && polls < MAX_POLLS) {
          polls++;
          timer = setTimeout(load, POLL_INTERVAL);
        }
      } catch {
        if (!cancelled) setParseStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [memory.id, memory.metadata?.file_id, memory.type]);

  // Listen for ocr-complete event — fires when parseFile finishes, no store needed
  useEffect(() => {
    const fileId = memory.metadata?.file_id as string | undefined;
    if (!fileId) return;

    function handleOcrComplete(e: Event) {
      const { memoryId } = (e as CustomEvent).detail as { memoryId: string; fileId: string };
      if (memoryId !== memory.id) return;

      // Re-read from IndexedDB directly
      (async () => {
        try {
          const { storage } = await import("@/storage");
          const file = await storage.readFile(fileId!);
          const fc = await storage.readFileContent(fileId!);
          setParseStatus(file?.parse_status || null);
          setExtractedText(fc?.extracted_text || null);
        } catch {
          // ignore
        }
      })();
    }

    window.addEventListener("ocr-complete", handleOcrComplete);
    return () => window.removeEventListener("ocr-complete", handleOcrComplete);
  }, [memory.id, memory.metadata?.file_id]);

  return (
    <div
      onClick={() => selectMemory(isSelected ? null : memory.id)}
      className={`group mb-1 flex cursor-pointer items-start gap-3 rounded-[4px] px-3 py-3 transition-[background-color,box-shadow,transform] ${
        isSelected
          ? "translate-x-1 bg-[#12233A] text-[#E7E1D3] shadow-[-4px_0_0_#E85327]"
          : "bg-[#D6D0C3] text-[#12233A] hover:bg-[#CBC4B7]"
      }`}
    >
      <TypeIcon type={memory.type} className="mt-0.5 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <p className={`truncate text-sm font-medium ${isSelected ? "text-[#E7E1D3]" : "text-[#12233A]"}`}>{memory.title}</p>
        {memory.content && (
          <p className={`mt-1 truncate text-xs ${isSelected ? "text-[#E7E1D3]/58" : "text-[#12233A]/55"}`}>
            {formatPreview(memory, extractedText, parseStatus)}
          </p>
        )}
        <CharCount memory={memory} extractedText={extractedText} parseStatus={parseStatus} isSelected={isSelected} />
      </div>


      <time className={`mt-0.5 flex-shrink-0 font-mono text-[9px] ${isSelected ? "text-[#E7E1D3]/45" : "text-[#12233A]/42"}`}>
        {formatTime(memory.created_at)}
      </time>
    </div>
  );
}

function formatPreview(memory: Memory, extractedText: string | null, parseStatus: string | null): string {
  if (memory.type === "pdf" || memory.type === "image" || memory.type === "video_link") {
    if (parseStatus === "parsing" || parseStatus === "pending") return "解析中...";
    if (parseStatus === "error") {
      return memory.type === "video_link" ? "视频分析失败" : "OCR 解析失败";
    }
    if (extractedText) return extractedText.slice(0, 80);
    if (memory.type === "video_link") return "视频分析中...";
    return memory.type === "pdf" ? "PDF 文档" : "图片";
  }
  return memory.content.slice(0, 80);
}

function CharCount({ memory, extractedText, parseStatus, isSelected }: { memory: Memory; extractedText: string | null; parseStatus: string | null; isSelected: boolean }) {
  const limit = memory.type === "pdf" ? 10000 : 3000;
  const mutedClass = isSelected ? "text-[#E7E1D3]/42" : "text-[#12233A]/42";

  if (memory.type === "text" || memory.type === "note" || memory.type === "web_link") {
    const current = memory.content.length;
    return (
      <p className={`mt-0.5 font-mono text-[9px] ${mutedClass}`}>
        {current.toLocaleString()} / {limit.toLocaleString()} 字
      </p>
    );
  }

  if (memory.type === "image" || memory.type === "pdf" || memory.type === "video_link") {
    if (parseStatus === "parsing" || parseStatus === "pending") {
      return (
        <p className={`mt-0.5 animate-pulse font-mono text-[9px] ${mutedClass}`}>
          {memory.type === "video_link" ? "视频分析中..." : "解析中..."}
        </p>
      );
    }
    if (parseStatus === "error") {
      return (
        <p className="mt-0.5 font-mono text-[9px] text-[#E85327]">
          {memory.type === "video_link" ? "视频分析失败" : "OCR 未就绪"}
        </p>
      );
    }
    const current = extractedText ? extractedText.length : 0;
    const videoLimit = 8000;
    const maxChars = memory.type === "video_link" ? videoLimit : limit;
    return (
      <p className={`mt-0.5 font-mono text-[9px] ${mutedClass}`}>
        {current.toLocaleString()} / {maxChars.toLocaleString()} 字
      </p>
    );
  }

  return null;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (diffDays === 1) return "昨天";
  if (diffDays < 7) return `${diffDays}天前`;

  return date.toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
}
