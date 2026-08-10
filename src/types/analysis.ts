export interface CrossDomainConnection {
  from: string;
  to: string;
  description: string;
}

export interface AnalysisInsights {
  common_themes: string[];
  contradictions: string[];
  timeline_patterns: string[];
  user_preferences: string[];
  cross_domain_connections: CrossDomainConnection[];
}

export interface AnalysisResult {
  /** Full analysis text in natural Chinese paragraphs */
  analysis: string;
  /** Structured findings */
  insights: AnalysisInsights;
  /** Memory IDs referenced in the analysis */
  sources: string[];
}
