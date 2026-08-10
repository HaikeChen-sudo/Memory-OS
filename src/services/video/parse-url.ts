/**
 * Video URL parser — detects platform and extracts video ID.
 *
 * Supported platforms: Bilibili, Douyin, Xiaohongshu (小红书)
 */

export type VideoPlatform = "bilibili" | "douyin" | "xiaohongshu";

export interface VideoURLInfo {
  platform: VideoPlatform;
  videoId: string;
  url: string; // normalized / original URL
}

/** Frame sampling configuration per platform. */
export const PLATFORM_CONFIG: Record<
  VideoPlatform,
  { interval: number; maxFrames: number }
> = {
  bilibili: { interval: 5, maxFrames: 30 },
  douyin: { interval: 2, maxFrames: 15 },
  xiaohongshu: { interval: 3, maxFrames: 20 },
};

/**
 * Parse a video URL and return platform + video ID.
 * Returns null if the URL is not a supported video platform.
 */
export function parseVideoURL(rawUrl: string): VideoURLInfo | null {
  // 如果粘贴的是分享文案（标题+链接），只取最后的 URL
  let url = rawUrl.trim();
  const urlMatch = url.match(/(https?:\/\/\S+)/g);
  if (urlMatch && !url.startsWith("http")) {
    // 取最后一个 URL（分享文案中链接通常在末尾）
    url = urlMatch[urlMatch.length - 1];
  } else if (urlMatch && url.startsWith("http")) {
    // 纯 URL，直接取第一个
    url = urlMatch[0];
  }

  // ── Bilibili ──
  // BV号: bilibili.com/video/BV1xx411c7mD
  const bvMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/);
  if (bvMatch) {
    return { platform: "bilibili", videoId: bvMatch[1], url };
  }

  // av号: bilibili.com/video/av12345
  const avMatch = url.match(/bilibili\.com\/video\/av(\d+)/i);
  if (avMatch) {
    return { platform: "bilibili", videoId: `av${avMatch[1]}`, url };
  }

  // 短链接: b23.tv/xxxxx
  if (/b23\.tv\/\S+/.test(url)) {
    return { platform: "bilibili", videoId: "", url };
  }

  // ── Douyin ──
  // douyin.com/video/123456
  const dyMatch = url.match(/douyin\.com\/video\/(\d+)/);
  if (dyMatch) {
    return { platform: "douyin", videoId: dyMatch[1], url };
  }

  // 短链接: v.douyin.com/xxxxx
  if (/v\.douyin\.com\/\S+/.test(url)) {
    return { platform: "douyin", videoId: "", url };
  }

  // ── Xiaohongshu ──
  // xiaohongshu.com/explore/xxxxx
  const xhsExplore = url.match(/xiaohongshu\.com\/explore\/([a-zA-Z0-9]+)/);
  if (xhsExplore) {
    return { platform: "xiaohongshu", videoId: xhsExplore[1], url };
  }

  // xiaohongshu.com/discovery/item/xxxxx
  const xhsItem = url.match(
    /xiaohongshu\.com\/discovery\/item\/([a-zA-Z0-9]+)/
  );
  if (xhsItem) {
    return { platform: "xiaohongshu", videoId: xhsItem[1], url };
  }

  // 短链接: xhslink.com/xxxxx
  if (/xhslink\.com\/\S+/.test(url)) {
    return { platform: "xiaohongshu", videoId: "", url };
  }

  return null;
}

/** Quick client-side platform detection (for UI hints, regex only). */
export function detectPlatform(url: string): VideoPlatform | null {
  if (/bilibili\.com|b23\.tv/i.test(url)) return "bilibili";
  if (/douyin\.com/i.test(url)) return "douyin";
  if (/xiaohongshu\.com|xhslink\.com/i.test(url)) return "xiaohongshu";
  return null;
}
