"use client";

import { useMemo } from "react";
import { createProjectBrief } from "@/features/briefing/projectBrief";
import { useMemories } from "@/hooks/useMemories";
import { useMinuteClock } from "@/hooks/useMinuteClock";

/** Loads workspace knowledge and derives the current project brief. */
export function useProjectBrief() {
  const memoriesQuery = useMemories();
  const now = useMinuteClock();
  const brief = useMemo(
    () => createProjectBrief({ memories: memoriesQuery.data ?? [], now }),
    [memoriesQuery.data, now]
  );

  return { ...memoriesQuery, brief };
}
