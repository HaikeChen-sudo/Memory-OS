"use client";

import type { TimeGroup } from "@/types";
import { MemoryCard } from "./MemoryCard";
import { TimeBadge } from "@/components/shared/TimeBadge";
import { timelineStagger } from "@/animations";

interface TimelineProps {
  groups: TimeGroup[];
}

export function Timeline({ groups }: TimelineProps) {
  if (groups.length === 0) {
    return (
      <div className="mx-2 flex flex-col items-start justify-end rounded-[5px] bg-[#12233A] px-4 py-8 text-[#E7E1D3] shadow-[4px_4px_0_#E85327]">
        <span className="mb-6 font-mono text-xl text-[#E85327]">＋</span>
        <span className="text-xs">上传你的第一条记忆</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col" {...timelineStagger}>
      {groups.map((group) => (
        <div key={group.layer}>
          <TimeBadge label={group.label} count={group.memories.length} />
          <div className="flex flex-col">
            {group.memories.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
