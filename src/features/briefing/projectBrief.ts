import type { Memory } from "@/types/memory";
import type {
  BriefAction,
  BriefEvidence,
  BriefRisk,
  ProjectBrief,
} from "@/types/projectBrief";

const RISK_PATTERN = /风险|阻塞|问题|待确认|依赖|延期|冲突|risk|blocker|issue|decision/i;
const ACTION_PATTERN = /待办|下一步|行动|跟进|确认|安排|todo|next step|follow up/i;
const STOP_WORDS = new Set([
  "这个", "我们", "可以", "需要", "项目", "内容", "一个", "以及", "通过", "关于",
  "the", "and", "for", "with", "from", "that", "this", "have", "will",
]);

/**
 * Builds a source-grounded project snapshot from the current workspace.
 *
 * It is deliberately deterministic: a team can inspect every conclusion
 * without requiring an LLM key or trusting an opaque intermediate result.
 */
export function createProjectBrief({
  memories,
  now = new Date(),
}: {
  memories: Memory[];
  now?: Date;
}): ProjectBrief {
  const ordered = [...memories].sort(
    (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime()
  );
  const recent = ordered.filter((memory) => isWithinDays(memory.updated_at, now, 7));
  const sourceMemories = recent.length > 0 ? recent : ordered;
  const focusAreas = collectFocusAreas(sourceMemories);
  const risks = sourceMemories
    .filter((memory) => RISK_PATTERN.test(searchableText(memory)))
    .slice(0, 3)
    .map(toRisk);
  const actions = sourceMemories
    .filter((memory) => ACTION_PATTERN.test(searchableText(memory)))
    .slice(0, 3)
    .map(toAction);

  return {
    generatedAt: now.toISOString(),
    memoryCount: memories.length,
    recentMemoryCount: recent.length,
    summary: buildSummary({ memoryCount: memories.length, recentMemoryCount: recent.length, focusAreas }),
    focusAreas,
    actions,
    risks,
  };
}

function isWithinDays(dateValue: string, now: Date, days: number): boolean {
  const timestamp = new Date(dateValue).getTime();
  const windowStart = now.getTime() - days * 24 * 60 * 60 * 1000;
  return Number.isFinite(timestamp) && timestamp >= windowStart && timestamp <= now.getTime();
}

function collectFocusAreas(memories: Memory[]): string[] {
  const counts = new Map<string, number>();
  for (const memory of memories) {
    const terms = memory.keywords?.length ? memory.keywords : tokenize(memory.title);
    for (const rawTerm of terms) {
      const term = rawTerm.trim();
      if (term.length < 2 || STOP_WORDS.has(term.toLowerCase())) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
    .slice(0, 4)
    .map(([term]) => term);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,，。；;、:：/\\|()（）\[\]「」"'“”]+/)
    .filter(Boolean);
}

function searchableText(memory: Memory): string {
  return [memory.title, memory.summary, searchableContent(memory.content), memory.keywords?.join(" ")]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function searchableContent(content: string): string {
  if (content.startsWith("data:")) return "";
  if (/^(pdf|audio|video):/i.test(content)) return "";
  return content;
}

function toEvidence(memory: Memory): BriefEvidence {
  return {
    memoryId: memory.id,
    title: memory.title,
    createdAt: memory.created_at,
  };
}

function toAction(memory: Memory): BriefAction {
  return {
    title: memory.title,
    reason: excerpt(memory),
    evidence: toEvidence(memory),
  };
}

function toRisk(memory: Memory): BriefRisk {
  return {
    title: memory.title,
    detail: excerpt(memory),
    evidence: toEvidence(memory),
  };
}

function excerpt(memory: Memory): string {
  const text = memory.summary || searchableContent(memory.content) || memory.title;
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function buildSummary({
  memoryCount,
  recentMemoryCount,
  focusAreas,
}: {
  memoryCount: number;
  recentMemoryCount: number;
  focusAreas: string[];
}): string {
  if (memoryCount === 0) return "还没有项目素材。先上传会议纪要、客户访谈或竞品资料。";
  const activity = recentMemoryCount > 0 ? `过去 7 天新增或更新 ${recentMemoryCount} 条资料` : "过去 7 天没有更新资料";
  const focus = focusAreas.length > 0 ? `，当前聚焦 ${focusAreas.join("、")}` : "，还没有足够的主题信号";
  return `工作区共有 ${memoryCount} 条资料；${activity}${focus}。`;
}
