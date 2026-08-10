import type { MemoryType } from "./memory";

export interface MetricScore {
  value: number;
  label: string;
  method: string;
}

export interface ActivityPoint {
  date: string;
  count: number;
}

export interface ModalityShare {
  type: MemoryType;
  count: number;
  share: number;
}

export interface DuplicateCandidate {
  leftMemoryId: string;
  leftTitle: string;
  rightMemoryId: string;
  rightTitle: string;
  similarity: number;
}

export type DataWarningCode =
  | "EMPTY_DATASET"
  | "LOW_COMPLETENESS"
  | "LOW_DIVERSITY"
  | "STALE_DATA"
  | "POSSIBLE_DUPLICATES";

export interface DataWarning {
  code: DataWarningCode;
  message: string;
  evidenceMemoryIds: string[];
}

export interface KnowledgeDatasetProfile {
  generatedAt: string;
  sampleSize: number;
  pairCount: number;
  duplicatePairCount: number;
  quality: MetricScore;
  completeness: MetricScore;
  freshness: MetricScore;
  diversity: MetricScore;
  uniqueness: MetricScore;
  shannonEntropy: number;
  concentrationHhi: number;
  activitySlope: number;
  activity: ActivityPoint[];
  modalities: ModalityShare[];
  duplicateCandidates: DuplicateCandidate[];
  warnings: DataWarning[];
}
