"use client";

import { useMemories, useTimelineGroups } from "@/hooks";
import { useMemoryStore } from "@/stores/memoryStore";
import { UploadZone } from "./UploadZone";
import { Timeline } from "./Timeline";

export function LeftPanel() {
  const { data: memories = [], isLoading, isError } = useMemories();
  const selectedTypes = useMemoryStore((s) => s.selectedTypes);

  const filtered = selectedTypes.length > 0
    ? memories.filter((m) => selectedTypes.includes(m.type))
    : memories;

  const groups = useTimelineGroups(filtered);

  return (
    <div className="flex h-full flex-col bg-[#E7E1D3] text-[#12233A]">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-[#12233A]/24 px-4 py-4">
        <p className="font-mono text-[9px] tracking-[0.16em] text-[#E85327]">01 / SOURCES</p>
        <h2 className="mt-1 text-lg font-semibold">数据源</h2>
      </div>

      {/* Upload area */}
      <div className="flex-shrink-0 border-b border-[#12233A]/24 px-4 py-4">
        <UploadZone />
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="font-mono text-[10px] tracking-[0.12em] text-[#12233A]/50">LOADING...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
            <span className="text-xs font-medium text-[#E85327]">加载失败</span>
            <span className="text-xs text-[#12233A]/55">请检查浏览器存储是否可用</span>
          </div>
        ) : (
          <Timeline groups={groups} />
        )}
      </div>
    </div>
  );
}
