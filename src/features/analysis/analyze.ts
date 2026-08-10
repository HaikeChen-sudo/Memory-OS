import type { Memory, AnalysisResult, AnalysisInsights } from "@/types";

const ANALYSIS_PROMPT = `你是用户的深度思考伙伴和分析引擎。你的任务不是简单罗列内容，而是透过表面找到深层的模式、联系和洞察。

基于提供的用户记忆内容，请完成以下分析：

1. 主题分布分析
   - 用户的记忆内容主要分布在哪些主题领域？
   - 用百分比估算各主题的占比
   - 识别核心主题和边缘主题

2. 共同线索与模式
   - 跨不同记忆是否存在重复出现的观点、方法论或思维模式？
   - 用户的兴趣是否围绕几个核心方向展开？

3. 矛盾与张力
   - 不同记忆之间是否存在不一致、矛盾或有趣的对比？
   - 这些矛盾反映了用户怎样的思考过程？

4. 时间线演进
   - 用户的关注点是否随时间发生了变化？
   - 是否有从入门到深入的学习曲线？

5. 用户画像推断
   - 从这些内容中能看出用户的什么职业背景、兴趣爱好、价值观？
   - 用户的思维特点是什么？（如：偏理性/感性、宏观/细节、务实/理想主义）

6. 跨领域关联
   - 不同领域的知识之间是否存在有趣的连接？
   - 某个领域的思维是否被应用到了另一个领域？

输出要求：
- 分析要有深度，不要停留在表面描述
- 用数据支撑你的观点（百分比、数量等）
- 指出"为什么这些联系有意义"，而不只是"它们有关联"
- 语调：像一个聪明的朋友在和你深度聊天，不是学术论文也不是清单
- 如果某些维度没有发现，可以跳过不写

严格按以下JSON格式返回，不要包含任何其他内容（不要markdown代码块标记）：
{
  "analysis": "整体分析文本（中文，自然段落，200-500字，结构清晰，有数据支撑）",
  "insights": {
    "common_themes": ["主题1", "主题2"],
    "contradictions": ["矛盾描述1"],
    "timeline_patterns": ["模式描述1"],
    "user_preferences": ["偏好描述1"],
    "cross_domain_connections": [{"from": "领域A", "to": "领域B", "description": "关联描述"}]
  }
}

如果某个类别没有发现，返回空数组。`;

/**
 * Deep analysis engine.
 *
 * Called when user intent is "analyze".
 * Reads the provided memories and generates structured insights via LLM.
 */
export async function analyze(
  query: string,
  memories: Memory[]
): Promise<AnalysisResult> {
  if (!memories.length) {
    return {
      analysis: "暂无足够的内容进行分析。请先上传一些记忆内容。",
      insights: emptyInsights(),
      sources: [],
    };
  }

  // Build context from memories
  const memoryBlocks = memories
    .map(
      (m, i) =>
        `[记忆${i + 1}]\n标题: ${m.title}\n类型: ${m.type}\n内容: ${m.content}\n关键词: ${m.keywords?.join(", ") || "无"}\n摘要: ${m.summary || "无"}\n时间: ${m.created_at}`
    )
    .join("\n\n");

  const prompt = `${ANALYSIS_PROMPT}\n\n用户问题: ${query}\n\n以下是用户的记忆内容：\n\n${memoryBlocks}`;

  try {
    const response = await fetch("/api/chat/llm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, temperature: 0.4, max_tokens: 2048 }),
    });

    if (!response.ok) {
      return fallbackAnalysis(memories);
    }

    const json = await response.json();
    if (json.fallback || json.error || !json.text) {
      return fallbackAnalysis(memories);
    }

    const parsed = parseAnalysisResponse(json.text.trim());
    if (parsed) {
      return {
        ...parsed,
        sources: memories.map((m) => m.id),
      };
    }

    // If parsing failed, use raw text as analysis
    return {
      analysis: json.text.trim(),
      insights: emptyInsights(),
      sources: memories.map((m) => m.id),
    };
  } catch (error) {
    console.error("[analysis] LLM call failed:", error);
    return fallbackAnalysis(memories);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function emptyInsights(): AnalysisInsights {
  return {
    common_themes: [],
    contradictions: [],
    timeline_patterns: [],
    user_preferences: [],
    cross_domain_connections: [],
  };
}

function fallbackAnalysis(memories: Memory[]): AnalysisResult {
  // Build a simple keyword frequency analysis as fallback
  const keywordMap = new Map<string, number>();
  const types = new Map<string, number>();
  const titles: string[] = [];

  for (const m of memories) {
    titles.push(m.title);
    types.set(m.type, (types.get(m.type) || 0) + 1);

    if (m.keywords) {
      for (const kw of m.keywords) {
        keywordMap.set(kw, (keywordMap.get(kw) || 0) + 1);
      }
    }
  }

  const topKeywords = [...keywordMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k]) => k);

  const typeBreakdown = [...types.entries()]
    .map(([t, c]) => `${t}(${c}条)`)
    .join("、");

  return {
    analysis: `你的记忆库共包含 ${memories.length} 条相关内容。\n\n主要内容类型: ${typeBreakdown}\n涉及话题: ${topKeywords.join("、")}\n\n内容列表:\n${titles.map((t) => `- ${t}`).join("\n")}`,
    insights: {
      common_themes: topKeywords,
      contradictions: [],
      timeline_patterns: [],
      user_preferences: [],
      cross_domain_connections: [],
    },
    sources: memories.map((m) => m.id),
  };
}

function parseAnalysisResponse(
  text: string
): { analysis: string; insights: AnalysisInsights } | null {
  // Try direct parse
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.analysis === "string" && parsed.insights) {
      return {
        analysis: parsed.analysis,
        insights: {
          common_themes: parsed.insights.common_themes || [],
          contradictions: parsed.insights.contradictions || [],
          timeline_patterns: parsed.insights.timeline_patterns || [],
          user_preferences: parsed.insights.user_preferences || [],
          cross_domain_connections:
            parsed.insights.cross_domain_connections || [],
        },
      };
    }
  } catch {
    // fall through
  }

  // Try markdown code block extraction
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try {
      const parsed = JSON.parse(codeBlock[1].trim());
      if (typeof parsed.analysis === "string" && parsed.insights) {
        return {
          analysis: parsed.analysis,
          insights: {
            common_themes: parsed.insights.common_themes || [],
            contradictions: parsed.insights.contradictions || [],
            timeline_patterns: parsed.insights.timeline_patterns || [],
            user_preferences: parsed.insights.user_preferences || [],
            cross_domain_connections:
              parsed.insights.cross_domain_connections || [],
          },
        };
      }
    } catch {
      // fall through
    }
  }

  return null;
}
