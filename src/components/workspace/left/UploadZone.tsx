"use client";

import { useState, useRef, useCallback } from "react";
import { useUpload } from "@/hooks/useUpload";
import { useMemoryStore } from "@/stores/memoryStore";
import type { MemoryType } from "@/types";

export function UploadZone() {
  const [activeTab, setActiveTab] = useState<"file" | "video" | "text">("file");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isDragging, setIsDragging, uploadFile, uploadText, isUploading } =
    useUpload();
  const uploadQueue = useMemoryStore((s) => s.uploadQueue);

  const handleFileSelect = useCallback(
    async (file: File) => {
      let type: MemoryType = "text";

      if (file.type.startsWith("image/")) type = "image";
      else if (file.type === "application/pdf") type = "pdf";

      await uploadFile(file, type);
    },
    [uploadFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [setIsDragging, handleFileSelect]
  );

  const handleTextSubmit = async () => {
    if (!noteContent.trim()) return;
    await uploadText(noteTitle || "未命名笔记", noteContent);
    setNoteTitle("");
    setNoteContent("");
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Tab switcher */}
      <div className="flex gap-1 rounded-[4px] bg-[#12233A] p-1">
        {[
          { key: "file", label: "文件" },
          { key: "video", label: "视频" },
          { key: "text", label: "笔记" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 rounded-[3px] py-2 font-mono text-[9px] tracking-[0.08em] transition-colors ${
              activeTab === tab.key
                ? "bg-[#E85327] text-[#12233A]"
                : "text-[#E7E1D3]/55 hover:text-[#E7E1D3]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* File upload */}
      {activeTab === "file" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[4px] border border-dashed p-7 transition-colors ${
            isDragging
              ? "border-[#E85327] bg-[#E85327]/12"
              : "border-[#12233A]/32 bg-[#D6D0C3] hover:border-[#12233A]"
          }`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-[#E85327] text-lg text-[#12233A]">
            +
          </span>
          <span className="text-center text-xs leading-5 text-[#12233A]/58">
            拖拽文件到此处或点击选择
          </span>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
            }}
          />
        </div>
      )}

      {/* Video link input — 制作中 */}
      {activeTab === "video" && (
        <div className="flex flex-col items-center justify-center gap-4 rounded-[4px] bg-[#12233A] py-9 text-[#E7E1D3]">
          <span className="rounded-[3px] bg-[#E85327] px-2 py-1 font-mono text-[9px] text-[#12233A]">
            IN PROGRESS
          </span>
          <p className="text-sm">视频分析功能制作中</p>
          <p className="text-center text-[10px] leading-relaxed text-[#E7E1D3]/48">
            支持 Bilibili / 抖音 / 小红书视频链接
            <br />
            自动提取关键画面并生成内容摘要
          </p>
          <button
            disabled
            className="cursor-not-allowed rounded-[3px] bg-[#E7E1D3]/12 px-6 py-2 text-xs text-[#E7E1D3]/38"
          >
            即将上线
          </button>
        </div>
      )}

      {/* Text note input */}
      {activeTab === "text" && (
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="标题（可选）"
            className="rounded-[4px] bg-[#F2EDDF] px-3 py-2 text-sm text-[#12233A] outline-none placeholder:text-[#12233A]/38 focus:shadow-[inset_0_-2px_0_#E85327]"
          />
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="输入内容..."
            rows={5}
            className="resize-none rounded-[4px] bg-[#F2EDDF] px-3 py-2 text-sm text-[#12233A] outline-none placeholder:text-[#12233A]/38 focus:shadow-[inset_0_-2px_0_#E85327]"
          />
          <button
            onClick={handleTextSubmit}
            disabled={isUploading || !noteContent.trim()}
            className="rounded-[4px] bg-[#E85327] py-2.5 text-xs font-semibold text-[#12233A] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isUploading ? "保存中..." : "保存笔记"}
          </button>
        </div>
      )}

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className="space-y-2">
          {uploadQueue.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-[4px] bg-[#D6D0C3] px-3 py-2"
            >
              <span className="flex-1 truncate text-xs text-[#12233A]/68">
                {item.name}
              </span>
              <div className="h-1 w-16 overflow-hidden bg-[#12233A]/16">
                <div
                  className="h-full bg-[#E85327] transition-all duration-300"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
