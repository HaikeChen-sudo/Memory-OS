import type { Memory, MemoryType } from "@/types/memory";
import type {
  ActivityPoint,
  DataWarning,
  DuplicateCandidate,
  KnowledgeDatasetProfile,
  MetricScore,
  ModalityShare,
} from "@/types/observatory";

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESHNESS_HALF_LIFE_DAYS = 90;
const DUPLICATE_THRESHOLD = 0.72;
const SUPPORTED_MODALITY_COUNT = 7;

/**
 * Profiles a knowledge dataset with reproducible, model-free statistics.
 * An inverted token index limits comparisons without dropping older rows.
 */
export function profileKnowledgeDataset({
  memories,
  now = new Date(),
}: {
  memories: Memory[];
  now?: Date;
}): KnowledgeDatasetProfile {
  const ordered = [...memories].sort(
    (left, right) => safeTimestamp(right.updated_at) - safeTimestamp(left.updated_at)
  );
  const completenessValue = mean(memories.map(completenessFor));
  const freshnessValue = mean(memories.map((memory) => freshnessFor(memory, now)));
  const modalities = modalityDistribution(memories);
  const { entropy, normalizedEntropy, hhi } = distributionStatistics(modalities);
  const { candidates: duplicateCandidates, duplicatePairCount } = findDuplicateCandidates(ordered);
  const pairCount = (ordered.length * (ordered.length - 1)) / 2;
  const uniquenessValue = pairCount === 0
    ? memories.length === 0 ? 0 : 1
    : 1 - duplicatePairCount / pairCount;
  const activity = dailyActivity(memories, now, 14);
  const activitySlope = linearSlope(activity.map((point) => point.count));
  const qualityValue = weightedMean([
    [completenessValue, 0.35],
    [freshnessValue, 0.2],
    [normalizedEntropy, 0.2],
    [uniquenessValue, 0.25],
  ]);

  const scores = {
    completeness: metric(completenessValue, "完整度", "标题 20% + 正文 35% + 摘要 20% + 关键词 15% + 来源 10%"),
    freshness: metric(freshnessValue, "新鲜度", "90 天半衰期的指数衰减均值"),
    diversity: metric(normalizedEntropy, "多样性", "以 7 种支持模态为全集的归一化 Shannon 熵"),
    uniqueness: metric(uniquenessValue, "独特性", `字符二元组与词元 Jaccard；阈值 ${DUPLICATE_THRESHOLD}`),
  };

  return {
    generatedAt: now.toISOString(),
    sampleSize: memories.length,
    pairCount,
    duplicatePairCount,
    quality: metric(qualityValue, "数据质量", "完整度 35% + 新鲜度 20% + 多样性 20% + 独特性 25%"),
    ...scores,
    shannonEntropy: round(entropy, 3),
    concentrationHhi: round(hhi, 3),
    activitySlope: round(activitySlope, 3),
    activity,
    modalities,
    duplicateCandidates,
    warnings: buildWarnings({ memories, scores, duplicateCandidates, duplicatePairCount }),
  };
}

function completenessFor(memory: Memory): number {
  const title = meaningful(memory.title) ? 0.2 : 0;
  const content = meaningfulContent(memory.content) ? 0.35 : 0;
  const summary = meaningful(memory.summary) ? 0.2 : 0;
  const keywords = memory.keywords && memory.keywords.length > 0 ? 0.15 : 0;
  const source = meaningful(memory.source_url) || meaningful(memory.source_id) ? 0.1 : 0;
  return title + content + summary + keywords + source;
}

function meaningful(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length >= 2;
}

function meaningfulContent(value: string): boolean {
  if (!meaningful(value)) return false;
  return !value.startsWith("data:image/") && !/^(pdf|audio|video):/.test(value);
}

function freshnessFor(memory: Memory, now: Date): number {
  const timestamp = safeTimestamp(memory.updated_at);
  if (timestamp === 0) return 0;
  const ageDays = Math.max(0, (now.getTime() - timestamp) / DAY_MS);
  return Math.exp((-Math.LN2 * ageDays) / FRESHNESS_HALF_LIFE_DAYS);
}

function modalityDistribution(memories: Memory[]): ModalityShare[] {
  const counts = new Map<MemoryType, number>();
  for (const memory of memories) counts.set(memory.type, (counts.get(memory.type) ?? 0) + 1);
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count, share: memories.length === 0 ? 0 : count / memories.length }))
    .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));
}

function distributionStatistics(modalities: ModalityShare[]): {
  entropy: number;
  normalizedEntropy: number;
  hhi: number;
} {
  if (modalities.length === 0) return { entropy: 0, normalizedEntropy: 0, hhi: 0 };
  const entropy = -modalities.reduce(
    (sum, modality) => sum + (modality.share > 0 ? modality.share * Math.log(modality.share) : 0),
    0
  );
  const normalizedEntropy = entropy / Math.log(SUPPORTED_MODALITY_COUNT);
  const hhi = modalities.reduce((sum, modality) => sum + modality.share ** 2, 0);
  return { entropy, normalizedEntropy, hhi };
}

function findDuplicateCandidates(memories: Memory[]): {
  candidates: DuplicateCandidate[];
  duplicatePairCount: number;
} {
  const fingerprints = memories.map((memory) => ({ memory, tokens: fingerprint(memory) }));
  const postings = new Map<string, number[]>();
  for (let index = 0; index < fingerprints.length; index += 1) {
    for (const token of fingerprints[index].tokens) {
      const indices = postings.get(token) ?? [];
      indices.push(index);
      postings.set(token, indices);
    }
  }
  const candidatePairs = new Set<string>();
  for (const indices of postings.values()) {
    for (let left = 0; left < indices.length; left += 1) {
      for (let right = left + 1; right < indices.length; right += 1) {
        candidatePairs.add(`${indices[left]}:${indices[right]}`);
      }
    }
  }
  const candidates: DuplicateCandidate[] = [];

  for (const pair of candidatePairs) {
    const [leftIndex, rightIndex] = pair.split(":").map(Number);
    const left = fingerprints[leftIndex];
    const right = fingerprints[rightIndex];
    const similarity = jaccard(left.tokens, right.tokens);
    if (similarity < DUPLICATE_THRESHOLD) continue;
    candidates.push({
      leftMemoryId: left.memory.id,
      leftTitle: left.memory.title,
      rightMemoryId: right.memory.id,
      rightTitle: right.memory.title,
      similarity: round(similarity, 3),
    });
  }

  return {
    candidates: candidates.sort((left, right) => right.similarity - left.similarity).slice(0, 20),
    duplicatePairCount: candidates.length,
  };
}

function fingerprint(memory: Memory): Set<string> {
  const text = [memory.title, memory.summary, meaningfulContent(memory.content) ? memory.content : ""]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const tokens = new Set(text.match(/[a-z0-9]{2,}/g) ?? []);
  const chineseSegments = text.match(/[\u4e00-\u9fff]+/g) ?? [];
  for (const segment of chineseSegments) {
    if (segment.length === 1) tokens.add(segment);
    for (let index = 0; index < segment.length - 1; index += 1) {
      tokens.add(segment.slice(index, index + 2));
    }
  }
  return tokens;
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function dailyActivity(memories: Memory[], now: Date, days: number): ActivityPoint[] {
  const end = startOfDay(now);
  const points: ActivityPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getTime() - offset * DAY_MS);
    points.push({ date: toDateKey(date), count: 0 });
  }
  const byDate = new Map(points.map((point) => [point.date, point]));
  for (const memory of memories) {
    const timestamp = safeTimestamp(memory.created_at);
    if (timestamp === 0) continue;
    const point = byDate.get(toDateKey(new Date(timestamp)));
    if (point) point.count += 1;
  }
  return points;
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const xMean = (values.length - 1) / 2;
  const yMean = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < values.length; index += 1) {
    numerator += (index - xMean) * (values[index] - yMean);
    denominator += (index - xMean) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

function buildWarnings({
  memories,
  scores,
  duplicateCandidates,
  duplicatePairCount,
}: {
  memories: Memory[];
  scores: { completeness: MetricScore; freshness: MetricScore; diversity: MetricScore; uniqueness: MetricScore };
  duplicateCandidates: DuplicateCandidate[];
  duplicatePairCount: number;
}): DataWarning[] {
  if (memories.length === 0) {
    return [{ code: "EMPTY_DATASET", message: "数据集为空，无法估计分布与质量。", evidenceMemoryIds: [] }];
  }
  const warnings: DataWarning[] = [];
  if (scores.completeness.value < 60) warnings.push({ code: "LOW_COMPLETENESS", message: "摘要、关键词或来源字段缺失较多。", evidenceMemoryIds: [] });
  if (scores.diversity.value < 35) warnings.push({ code: "LOW_DIVERSITY", message: "内容模态集中，跨模态分析的信息增益有限。", evidenceMemoryIds: [] });
  if (scores.freshness.value < 40) warnings.push({ code: "STALE_DATA", message: "资料整体较旧，近期判断可能缺少新证据。", evidenceMemoryIds: [] });
  if (duplicatePairCount > 0) warnings.push({
    code: "POSSIBLE_DUPLICATES",
    message: `检测到 ${duplicatePairCount} 组高相似资料。`,
    evidenceMemoryIds: duplicateCandidates.flatMap((candidate) => [candidate.leftMemoryId, candidate.rightMemoryId]),
  });
  return warnings;
}

function metric(value: number, label: string, method: string): MetricScore {
  return { value: round(clamp01(value) * 100, 3), label, method };
}

function weightedMean(values: Array<[number, number]>): number {
  const totalWeight = values.reduce((sum, [, weight]) => sum + weight, 0);
  return totalWeight === 0 ? 0 : values.reduce((sum, [value, weight]) => sum + value * weight, 0) / totalWeight;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeTimestamp(value: string): number {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
