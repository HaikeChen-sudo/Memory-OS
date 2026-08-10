/**
 * Video analysis orchestrator — server-side only.
 *
 * Pipeline: yt-dlp download → ffmpeg extract frames → 豆包 Lite describe
 *
 * Uses child_process for yt-dlp/ffmpeg. Must run on server.
 * DO NOT import this file from client-side code.
 */

import { execFile } from "child_process";
import { readFile, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { VideoPlatform } from "./parse-url";

/* ── Types ── */

export interface VideoAnalysisInput {
  url: string;
  platform: VideoPlatform;
  videoId: string;
  interval: number;
  maxFrames: number;
}

export interface VideoAnalysisResult {
  text: string;
  framesAnalyzed: number;
  totalFrames: number;
  platform: VideoPlatform;
  metadata: {
    title?: string;
    duration?: number;
    url: string;
    videoId: string;
  };
}

/* ── Tool paths ── */

function toolPath(name: string): string {
  return path.join(process.cwd(), "tools", name);
}

function checkTools(): { ytDlp: boolean; ffmpeg: boolean } {
  return {
    ytDlp: existsSync(toolPath("yt-dlp")),
    ffmpeg: existsSync(toolPath("ffmpeg")),
  };
}

/* ── Shell helpers ── */

function execFileAsync(
  file: string,
  args: string[],
  timeout = 120_000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

/* ── Main ── */

export async function analyzeVideo(
  input: VideoAnalysisInput
): Promise<VideoAnalysisResult> {
  // 1. Validate tools
  const tools = checkTools();
  if (!tools.ytDlp) {
    throw new Error("yt-dlp not found. Run: bash scripts/install-tools.sh");
  }
  if (!tools.ffmpeg) {
    throw new Error("ffmpeg not found. Run: bash scripts/install-tools.sh");
  }

  const ytDlp = toolPath("yt-dlp");
  const ffmpeg = toolPath("ffmpeg");

  // 2. Create temp directory
  const tmpDir = path.join(os.tmpdir(), `video-analyze-${crypto.randomUUID()}`);
  await mkdir(tmpDir, { recursive: true });

  try {
    // 3. Download video with yt-dlp
    const videoOutput = path.join(tmpDir, "video.%(ext)s");
    console.log(`[视频分析] Downloading: ${input.url}`);

    await execFileAsync(ytDlp, [
      "-f",
      "bestvideo[height<=480]+bestaudio/best[height<=480]/best",
      "-o",
      videoOutput,
      "--user-agent",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      "--ffmpeg-location",
      ffmpeg,
      "--no-playlist",
      "--max-filesize",
      "500M",
      "--no-warnings",
      input.url,
    ], 180_000);

    // Find the downloaded video file
    const tmpFiles = await readdir(tmpDir);
    const videoFile = tmpFiles.find(
      (f) =>
        f.endsWith(".mp4") ||
        f.endsWith(".mkv") ||
        f.endsWith(".webm") ||
        f.endsWith(".flv") ||
        f.includes(".mp4")   // yt-dlp may prefix with format id: video.f100023.mp4
    );
    if (!videoFile) {
      throw new Error("Video download failed — no video file found in output");
    }
    const videoPath = path.join(tmpDir, videoFile);
    console.log(`[视频分析] Downloaded: ${videoFile}`);

    // 4. Extract metadata (title, duration)
    let title: string | undefined;
    let duration: number | undefined;
    try {
      const { stdout: metaJson } = await execFileAsync(ytDlp, [
        "--dump-json",
        "--user-agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "--no-playlist",
        "--no-warnings",
        input.url,
      ], 30_000);
      const meta = JSON.parse(metaJson.trim());
      title = meta.title;
      duration = meta.duration;
      console.log(`[视频分析] Title: ${title}, Duration: ${duration}s`);
    } catch {
      console.log("[视频分析] Could not extract metadata, continuing...");
    }

    // 5. Extract frames with ffmpeg
    const framesDir = path.join(tmpDir, "frames");
    await mkdir(framesDir, { recursive: true });

    const { interval, maxFrames } = input;
    const effectiveDuration = duration || 60; // fallback 60s
    const totalFrames = Math.min(
      maxFrames,
      Math.floor(effectiveDuration / interval)
    );

    console.log(
      `[视频分析] Extracting ${totalFrames} frames (every ${interval}s)...`
    );

    // Use ffmpeg fps filter for efficient extraction
    await execFileAsync(ffmpeg, [
      "-i",
      videoPath,
      "-vf",
      `fps=1/${interval}`,
      "-frames:v",
      String(totalFrames),
      "-q:v",
      "3",
      "-y",
      path.join(framesDir, "frame_%03d.jpg"),
    ], 60_000);

    // 6. Read frames as base64
    const frameFiles = (await readdir(framesDir))
      .filter((f) => f.endsWith(".jpg"))
      .sort();

    if (frameFiles.length === 0) {
      throw new Error("No frames extracted from video");
    }

    console.log(`[视频分析] ${frameFiles.length} frames extracted`);

    const frameBase64List: string[] = [];
    for (const frameFile of frameFiles) {
      const buf = await readFile(path.join(framesDir, frameFile));
      const b64 = `data:image/jpeg;base64,${buf.toString("base64")}`;
      frameBase64List.push(b64);
    }

    // 7. Analyze each frame with 豆包 Lite
    const { describeVideoFrame } = await import(
      "@/services/parser/doubao-ocr"
    );
    const descriptions: string[] = [];

    for (let i = 0; i < frameBase64List.length; i++) {
      console.log(
        `[视频分析] Analyzing frame ${i + 1}/${frameBase64List.length}...`
      );
      const desc = await describeVideoFrame(frameBase64List[i]);
      if (desc && desc !== "无实质内容" && !desc.includes("无实质内容")) {
        descriptions.push(`[${formatTimestamp(i * interval)}] ${desc}`);
      }
    }

    if (descriptions.length === 0) {
      console.log("[视频分析] No meaningful frame descriptions generated");
    }

    // 8. Aggregate results
    const validCount = descriptions.length;
    const skippedCount = frameBase64List.length - validCount;
    const header = [
      `平台: ${input.platform}`,
      title ? `标题: ${title}` : null,
      duration ? `时长: ${formatDuration(Math.floor(duration || 0))}` : null,
      `有效帧: ${validCount} (跳过 ${skippedCount} 个无效帧)`,
    ]
      .filter(Boolean)
      .join(" | ");

    const text = `${header}\n\n${descriptions.join("\n\n")}`;

    console.log(
      `[视频分析] Done — ${text.length} chars from ${descriptions.length} frames`
    );

    return {
      text,
      framesAnalyzed: descriptions.length,
      totalFrames: frameFiles.length,
      platform: input.platform,
      metadata: {
        title,
        duration: duration ? Math.floor(duration) : undefined,
        url: input.url,
        videoId: input.videoId,
      },
    };
  } finally {
    // 9. Cleanup temp directory
    try {
      await rm(tmpDir, { recursive: true, force: true });
      console.log(`[视频分析] Cleaned up ${tmpDir}`);
    } catch {
      // Best-effort cleanup
    }
  }
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}时${m}分`;
  return `${m}分${seconds % 60}秒`;
}
