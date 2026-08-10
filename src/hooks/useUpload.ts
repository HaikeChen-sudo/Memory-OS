"use client";

import { useState, useCallback } from "react";
import { useMemoryStore } from "@/stores/memoryStore";
import { useCreateMemory } from "./useMemories";
import type { MemoryType } from "@/types";

export function useUpload() {
  const [isDragging, setIsDragging] = useState(false);
  const { addToUploadQueue, updateUploadProgress, removeFromUploadQueue } =
    useMemoryStore();
  const createMemory = useCreateMemory();

  const uploadFile = useCallback(
    async (file: File, type: MemoryType) => {
      const uploadId = crypto.randomUUID();
      addToUploadQueue({
        id: uploadId,
        name: file.name,
        progress: 0,
        status: "uploading",
      });

      try {
        updateUploadProgress(uploadId, 30);

        const title = file.name.replace(/\.[^.]+$/, "");

        await createMemory.mutateAsync({
          type,
          title,
          content: "",
          file,
        });

        updateUploadProgress(uploadId, 100);
        setTimeout(() => removeFromUploadQueue(uploadId), 600);
      } catch (error) {
        console.error("Upload failed:", error);
        removeFromUploadQueue(uploadId);
      }
    },
    [addToUploadQueue, updateUploadProgress, removeFromUploadQueue, createMemory]
  );

  const uploadText = useCallback(
    async (title: string, content: string) => {
      await createMemory.mutateAsync({
        type: "text",
        title,
        content,
      });
    },
    [createMemory]
  );

  const uploadLink = useCallback(
    async (title: string, url: string, type: MemoryType) => {
      await createMemory.mutateAsync({
        type,
        title,
        content: url,
        source_url: url,
      });
    },
    [createMemory]
  );

  return {
    isDragging,
    setIsDragging,
    uploadFile,
    uploadText,
    uploadLink,
    isUploading: createMemory.isPending,
  };
}
