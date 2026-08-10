"use client";

import { useMemo } from "react";
import { profileKnowledgeDataset } from "@/features/observatory/profileKnowledgeDataset";
import { useMemories } from "@/hooks/useMemories";
import { useMinuteClock } from "@/hooks/useMinuteClock";

/** Loads the active workspace and computes its reproducible data profile. */
export function useKnowledgeObservatory() {
  const memoriesQuery = useMemories();
  const now = useMinuteClock();
  const profile = useMemo(
    () => profileKnowledgeDataset({ memories: memoriesQuery.data ?? [], now }),
    [memoriesQuery.data, now]
  );
  return { ...memoriesQuery, profile };
}
