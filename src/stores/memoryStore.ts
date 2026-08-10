import { create } from "zustand";
import type { Memory, MemoryType, TimeGroup } from "@/types";

interface MemoryState {
  memories: Memory[];
  selectedTypes: MemoryType[];
  selectedMemoryId: string | null;
  uploadQueue: { id: string; name: string; progress: number; status: string }[];

  setMemories: (memories: Memory[]) => void;
  addMemory: (memory: Memory) => void;
  removeMemory: (id: string) => void;
  selectMemory: (id: string | null) => void;
  addToUploadQueue: (item: {
    id: string;
    name: string;
    progress: number;
    status: string;
  }) => void;
  updateUploadProgress: (id: string, progress: number) => void;
  removeFromUploadQueue: (id: string) => void;
}

export const useMemoryStore = create<MemoryState>((set) => ({
  memories: [],
  selectedTypes: [],
  selectedMemoryId: null,
  uploadQueue: [],

  setMemories: (memories) => set({ memories }),
  addMemory: (memory) =>
    set((state) => ({ memories: [memory, ...state.memories] })),
  removeMemory: (id) =>
    set((state) => ({
      memories: state.memories.filter((m) => m.id !== id),
    })),
  selectMemory: (id) => set({ selectedMemoryId: id }),
  addToUploadQueue: (item) =>
    set((state) => ({ uploadQueue: [...state.uploadQueue, item] })),
  updateUploadProgress: (id, progress) =>
    set((state) => ({
      uploadQueue: state.uploadQueue.map((item) =>
        item.id === id ? { ...item, progress } : item
      ),
    })),
  removeFromUploadQueue: (id) =>
    set((state) => ({
      uploadQueue: state.uploadQueue.filter((item) => item.id !== id),
    })),
}));

export function groupMemoriesByTime(memories: Memory[]): TimeGroup[] {
  const now = new Date();
  const groups: Record<string, Memory[]> = {};

  for (const memory of memories) {
    const created = new Date(memory.created_at);
    const diffMs = now.getTime() - created.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let layer: string;
    if (diffDays === 0) layer = "today";
    else if (diffDays === 1) layer = "yesterday";
    else if (diffDays < 7) layer = "this_week";
    else if (diffDays < 30) layer = "this_month";
    else if (diffDays < 365) layer = "this_year";
    else layer = "older";

    if (!groups[layer]) groups[layer] = [];
    groups[layer].push(memory);
  }

  const labels: Record<string, string> = {
    today: "今天",
    yesterday: "昨天",
    this_week: "本周",
    this_month: "本月",
    this_year: "今年",
    older: "更早",
  };

  const order = [
    "today",
    "yesterday",
    "this_week",
    "this_month",
    "this_year",
    "older",
  ];

  return order
    .filter((layer) => groups[layer]?.length > 0)
    .map((layer) => ({
      layer: layer as TimeGroup["layer"],
      label: labels[layer],
      memories: groups[layer],
    }));
}
