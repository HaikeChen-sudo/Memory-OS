"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemoryStore, groupMemoriesByTime } from "@/stores/memoryStore";
import { useFolderStore } from "@/stores/folderStore";
import { memoryManager } from "@/features";
import type { Memory, MemoryCreateInput, MemoryType } from "@/types";

export function useMemories(type?: MemoryType) {
  const { setMemories } = useMemoryStore();
  const folderId = useFolderStore((s) => s.activeFolderId);

  return useQuery({
    queryKey: ["memories", folderId, type],
    queryFn: async () => {
      const memories = await memoryManager.getAll(type, folderId ?? undefined);
      setMemories(memories);
      return memories;
    },
    enabled: !!folderId,
  });
}

export function useCreateMemory() {
  const queryClient = useQueryClient();
  const { addMemory } = useMemoryStore();
  const folderId = useFolderStore((s) => s.activeFolderId);

  return useMutation({
    mutationFn: (input: Omit<MemoryCreateInput, "folder_id">) => {
      if (!folderId) throw new Error("No folder selected");
      return memoryManager.create({ ...input, folder_id: folderId });
    },
    onSuccess: (memory) => {
      addMemory(memory);
      queryClient.invalidateQueries({ queryKey: ["memories", memory.folder_id] });
    },
  });
}

export function useDeleteMemory() {
  const queryClient = useQueryClient();
  const { removeMemory } = useMemoryStore();

  return useMutation({
    mutationFn: (id: string) => memoryManager.delete(id),
    onSuccess: (_, id) => {
      removeMemory(id);
      queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
  });
}

export function useTimelineGroups(memories: Memory[]) {
  return groupMemoriesByTime(memories);
}
