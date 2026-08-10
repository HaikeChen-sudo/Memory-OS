/** A source that supports a generated project brief statement. */
export interface BriefEvidence {
  memoryId: string;
  title: string;
  createdAt: string;
}

/** A concrete next step derived from project knowledge. */
export interface BriefAction {
  title: string;
  reason: string;
  evidence: BriefEvidence;
}

/** A risk or unresolved item that needs an owner. */
export interface BriefRisk {
  title: string;
  detail: string;
  evidence: BriefEvidence;
}

/** A source-grounded snapshot of a workspace's current project context. */
export interface ProjectBrief {
  generatedAt: string;
  memoryCount: number;
  recentMemoryCount: number;
  summary: string;
  focusAreas: string[];
  actions: BriefAction[];
  risks: BriefRisk[];
}
