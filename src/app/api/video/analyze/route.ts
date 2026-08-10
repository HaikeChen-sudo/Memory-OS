/**
 * Video analysis endpoint.
 *
 * POST /api/video/analyze
 * Body: { url: string }
 * Returns: { text, frames_analyzed, total_frames, platform, metadata }
 *
 * Supports: Bilibili, Douyin, Xiaohongshu (小红书)
 * Uses: yt-dlp (download) → ffmpeg (extract frames) → 豆包 2.0 Lite (analyze)
 */

import { NextRequest, NextResponse } from "next/server";
import { parseVideoURL, PLATFORM_CONFIG } from "@/services/video/parse-url";
import { analyzeVideo } from "@/services/video/analyze-video";

export const maxDuration = 300; // 5 minutes for video processing

export async function POST(request: NextRequest) {
  try {
    console.log("[Video API] Request received");
    const body = await request.json();
    const url: string | undefined = body?.url;
    console.log("[Video API] URL:", url);

    if (!url || typeof url !== "string" || !url.trim()) {
      return NextResponse.json(
        { error: "url (string) is required" },
        { status: 400 }
      );
    }

    const parsed = parseVideoURL(url);
    if (!parsed) {
      return NextResponse.json(
        { error: "不支持的视频链接" },
        { status: 400 }
      );
    }

    console.log("[Video API] Platform:", parsed.platform);

    if (!process.env.DOUBAO_LITE_API_KEY) {
      return NextResponse.json(
        { error: "DOUBAO_LITE_API_KEY 未配置" },
        { status: 500 }
      );
    }

    const config = PLATFORM_CONFIG[parsed.platform];
    console.log("[Video API] Starting analysis...");

    const result = await analyzeVideo({
      url: parsed.url,
      platform: parsed.platform,
      videoId: parsed.videoId,
      interval: config.interval,
      maxFrames: config.maxFrames,
    });

    console.log("[Video API] Done, returning result");
    return NextResponse.json({
      text: result.text,
      frames_analyzed: result.framesAnalyzed,
      total_frames: result.totalFrames,
      platform: result.platform,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error("[Video API] ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Video analysis failed" },
      { status: 500 }
    );
  }
}
