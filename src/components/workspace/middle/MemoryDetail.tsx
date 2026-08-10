"use client";

import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Memory } from "@/types";
import { TypeIcon } from "@/components/shared/TypeIcon";
import { useMemoryStore } from "@/stores/memoryStore";
import { useDeleteMemory } from "@/hooks/useMemories";
import { memoryManager } from "@/features";

interface MemoryDetailProps {
  memory: Memory;
}

export function MemoryDetail({ memory }: MemoryDetailProps) {
  const selectMemory = useMemoryStore((s) => s.selectMemory);
  const deleteMemory = useDeleteMemory();

  // Inline title editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState(memory.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Load OCR/extracted text for image/pdf memories
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [parseStatus, setParseStatus] = useState<string | null>(null);

  useEffect(() => {
    const fileId = memory.metadata?.file_id as string | undefined;
    if (!fileId) return;
    if (memory.type !== "image" && memory.type !== "pdf" && memory.type !== "video_link") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const MAX_POLLS = 5;

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

        if ((status === "parsing" || status === "pending") && polls < MAX_POLLS) {
          polls++;
          timer = setTimeout(load, 3000);
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

  const handleDelete = async () => {
    const confirmed = window.confirm("确定要删除这条记忆吗？");
    if (!confirmed) return;
    selectMemory(null);
    deleteMemory.mutate(memory.id);
  };

  const startRename = () => {
    setEditTitle(memory.title);
    setIsEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 50);
  };

  const queryClient = useQueryClient();

  const saveRename = async () => {
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== memory.title) {
      await memoryManager.update(memory.id, { title: trimmed });
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") saveRename();
    if (e.key === "Escape") setIsEditingTitle(false);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="flex h-full flex-col bg-[#D6D0C3] text-[#12233A]">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#12233A]/24 px-4 py-4">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <TypeIcon type={memory.type} />
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onBlur={saveRename}
              onKeyDown={handleTitleKeyDown}
              className="min-w-0 flex-1 rounded-[3px] bg-[#E7E1D3] px-2 py-1 text-sm font-medium text-[#12233A] outline-none shadow-[inset_0_-2px_0_#E85327]"
            />
          ) : (
            <h2
              onClick={startRename}
              className="max-w-[220px] cursor-pointer truncate text-sm font-semibold text-[#12233A] transition-colors hover:text-[#E85327]"
              title="点击重命名"
            >
              {memory.title}
            </h2>
          )}
        </div>
        <button
          onClick={() => selectMemory(null)}
          className="ml-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[3px] bg-[#12233A] text-lg leading-none text-[#E7E1D3] transition-colors hover:bg-[#E85327] hover:text-[#12233A]"
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* OCR/Extracted text for image and PDF — primary content, no image viewer */}
        {(memory.type === "image" || memory.type === "pdf" || memory.type === "video_link") && (
          <div className="rounded-[4px] bg-[#E7E1D3] p-4 shadow-[4px_4px_0_#12233A]">
            <span className="font-mono text-[9px] tracking-[0.12em] text-[#E85327]">
              {memory.type === "video_link" ? "视频分析" : "识别文字"}
            </span>
            {parseStatus === "parsing" || parseStatus === "pending" ? (
              <p className="mt-1 animate-pulse text-sm text-[#12233A]/52">
                解析中...
              </p>
            ) : parseStatus === "error" ? (
              <p className="mt-1 text-sm text-[#E85327]">
                {memory.type === "video_link" ? "视频分析失败" : "OCR 解析失败"}
              </p>
            ) : extractedText ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#12233A]/78">
                {extractedText}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[#12233A]/45">
                暂无内容
              </p>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-4 rounded-[4px] bg-[#E7E1D3] p-4">
          <div>
            <span className="font-mono text-[9px] tracking-[0.1em] text-[#12233A]/45">
              类型
            </span>
            <p className="mt-1 text-sm text-[#12233A]/78">
              {typeLabel(memory.type)}
            </p>
          </div>

          <div>
            <span className="font-mono text-[9px] tracking-[0.1em] text-[#12233A]/45">
              创建时间
            </span>
            <p className="mt-1 text-sm text-[#12233A]/78">
              {formatDate(memory.created_at)}
            </p>
          </div>

          {/* Text content for non-media types */}
          {memory.type !== "image" && memory.type !== "pdf" && memory.type !== "video_link" && memory.content && (
            <div>
              <span className="font-mono text-[9px] tracking-[0.1em] text-[#12233A]/45">
                内容
              </span>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[#12233A]/78">
                {memory.content}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer — Delete */}
      <div className="flex-shrink-0 border-t border-[#12233A]/24 px-4 py-4">
        <button
          onClick={handleDelete}
          disabled={deleteMemory.isPending}
          className="w-full rounded-[4px] bg-[#12233A] py-2.5 text-xs font-medium text-[#E7E1D3] transition-colors hover:bg-[#E85327] hover:text-[#12233A] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deleteMemory.isPending ? "删除中..." : "删除此记忆"}
        </button>
      </div>
    </div>
  );
}

function typeLabel(type: Memory["type"]): string {
  const labels: Record<string, string> = {
    image: "图片",
    pdf: "PDF 文档",
    text: "文本",
    video_link: "视频链接",
    audio_link: "音频链接",
    web_link: "网页链接",
    note: "笔记",
  };
  return labels[type] || type;
}
